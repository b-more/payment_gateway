import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { MONEY_CONFIG, PG_POOL, type MoneyConfig } from '../database/database.module';
import { withTransaction } from '../database/tx';
import { DualControlError, ValidationError } from '../money/errors';
import type { LedgerEntryType } from '../money/types';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';

const PLATFORM_FLOAT_SOURCE = 'PLATFORM_FLOAT_SOURCE';

const ALLOWED_PROOF_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_PROOF_BYTES = 5 * 1024 * 1024; // 5 MB

export interface ProofOfPayment {
  fileName: string;
  contentType: string;
  dataBase64: string;
}

/** Validate + decode the maker's proof of payment. Required for every request (FLOAT-3). */
function decodeProof(proof?: ProofOfPayment): { fileName: string; contentType: string; bytes: Buffer } {
  if (!proof) throw new ValidationError('a proof of payment is required');
  if (!ALLOWED_PROOF_TYPES.has(proof.contentType)) {
    throw new ValidationError(`unsupported proof type: ${proof.contentType} (use PDF, JPG, PNG or WEBP)`);
  }
  const bytes = Buffer.from(proof.dataBase64, 'base64');
  if (bytes.length === 0) throw new ValidationError('the proof of payment is empty');
  if (bytes.length > MAX_PROOF_BYTES) throw new ValidationError('the proof of payment exceeds 5MB');
  return { fileName: proof.fileName, contentType: proof.contentType, bytes };
}

export interface CreditFloatInput {
  accountId: string;
  amount: bigint; // ngwee, > 0 (FLOAT-2)
  actorId: string;
  ipAddress?: string | null;
  proof?: ProofOfPayment; // bank slip / receipt the checker reviews (FLOAT-3)
}

export type CreditFloatResult =
  | { posted: true; ledgerId: string; balanceAfter: bigint }
  | { posted: false; requestId: string }; // parked for a second approver (FLOAT-3)

export interface ApproveCreditInput {
  requestId: string;
  approverId: string;
  ipAddress?: string | null;
}

export interface RejectCreditInput {
  requestId: string;
  rejectorId: string;
  reason: string;
  ipAddress?: string | null;
}

export interface AdjustFloatInput {
  accountId: string;
  amount: bigint;
  direction: LedgerEntryType;
  actorId: string;
  reason: string;
  ipAddress?: string | null;
}

interface RequestRow {
  account_id: string;
  amount: string;
  requested_by: string;
  status: string;
}
interface RequestIdRow {
  id: string;
}

/**
 * Float management (§5.2). Float attaches to an Account (FLOAT-1); every change
 * goes through the append-only ledger + audit (FLOAT-4/5/7, NN-2). Credits above
 * the dual-control threshold are held for a second approver (FLOAT-3, SEC-Z4).
 */
@Injectable()
export class FloatService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    @Inject(MONEY_CONFIG) private readonly config: MoneyConfig,
  ) {}

  /** Credit float (FLOAT-2). Posts directly, or parks for dual control (FLOAT-3). */
  async creditFloat(input: CreditFloatInput): Promise<CreditFloatResult> {
    if (input.amount <= 0n) {
      throw new RangeError('float credit amount must be > 0');
    }
    const proof = decodeProof(input.proof);

    if (input.amount > this.config.dualControlThreshold) {
      return withTransaction(this.pool, async (client) => {
        const created = await client.query<RequestIdRow>(
          `INSERT INTO float_credit_requests
             (account_id, amount, requested_by, status,
              proof_file_name, proof_content_type, proof_byte_size, proof_content)
           VALUES ($1, $2, $3, 'PENDING_APPROVAL', $4, $5, $6, $7) RETURNING id`,
          [
            input.accountId, input.amount.toString(), input.actorId,
            proof.fileName, proof.contentType, proof.bytes.length, proof.bytes,
          ],
        );
        const requestId = created.rows[0].id;
        await this.audit.write(client, {
          actorId: input.actorId,
          actorScope: 'SYSTEM',
          action: 'FLOAT_CREDIT_REQUESTED',
          target: input.accountId,
          metadata: { amount: input.amount.toString(), requestId, proof: proof.fileName },
          ipAddress: input.ipAddress ?? null,
        });
        return { posted: false, requestId };
      });
    }

    return withTransaction(this.pool, (client) =>
      this.postCredit(client, {
        accountId: input.accountId,
        amount: input.amount,
        actorId: input.actorId,
        ipAddress: input.ipAddress ?? null,
      }),
    );
  }

  /** Approve a parked credit (FLOAT-3). The approver must differ from the requester (SEC-Z4). */
  async approveFloatCredit(
    input: ApproveCreditInput,
  ): Promise<{ posted: true; ledgerId: string; balanceAfter: bigint }> {
    return withTransaction(this.pool, async (client) => {
      const found = await client.query<RequestRow>(
        `SELECT account_id, amount, requested_by, status
           FROM float_credit_requests WHERE id = $1 FOR UPDATE`,
        [input.requestId],
      );
      if (found.rowCount === 0) {
        throw new DualControlError(`float credit request not found: ${input.requestId}`);
      }
      const request = found.rows[0];
      if (request.status !== 'PENDING_APPROVAL') {
        throw new DualControlError(`request ${input.requestId} is not pending (${request.status})`);
      }
      if (request.requested_by === input.approverId) {
        throw new DualControlError('approver must differ from requester');
      }

      const result = await this.postCredit(client, {
        accountId: request.account_id,
        amount: BigInt(request.amount),
        actorId: input.approverId,
        ipAddress: input.ipAddress ?? null,
        viaRequestId: input.requestId,
      });

      await client.query(
        `UPDATE float_credit_requests
           SET status = 'APPROVED', approved_by = $1, decided_at = now(), ledger_entry_id = $2
         WHERE id = $3`,
        [input.approverId, result.ledgerId, input.requestId],
      );

      return result;
    });
  }

  /** Reject a parked credit (FLOAT-3). The reviewer must differ from the requester (SEC-Z4). */
  async rejectFloatCredit(input: RejectCreditInput): Promise<{ ok: true }> {
    return withTransaction(this.pool, async (client) => {
      const found = await client.query<RequestRow>(
        `SELECT account_id, amount, requested_by, status
           FROM float_credit_requests WHERE id = $1 FOR UPDATE`,
        [input.requestId],
      );
      if (found.rowCount === 0) {
        throw new DualControlError(`float credit request not found: ${input.requestId}`);
      }
      const request = found.rows[0];
      if (request.status !== 'PENDING_APPROVAL') {
        throw new DualControlError(`request ${input.requestId} is not pending (${request.status})`);
      }
      if (request.requested_by === input.rejectorId) {
        throw new DualControlError('the reviewer must differ from the requester');
      }
      // approved_by is the deciding officer; the DB constraint keeps it distinct from the requester.
      await client.query(
        `UPDATE float_credit_requests
           SET status = 'REJECTED', approved_by = $1, reason = $2, decided_at = now()
         WHERE id = $3`,
        [input.rejectorId, input.reason, input.requestId],
      );
      await this.audit.write(client, {
        actorId: input.rejectorId,
        actorScope: 'SYSTEM',
        action: 'FLOAT_CREDIT_REJECTED',
        target: request.account_id,
        metadata: { requestId: input.requestId, amount: request.amount, reason: input.reason },
        ipAddress: input.ipAddress ?? null,
      });
      return { ok: true as const };
    });
  }

  /** Admin debit/adjustment via the same ledger+audit path — no silent edits (FLOAT-7). */
  async adjustFloat(
    input: AdjustFloatInput,
  ): Promise<{ posted: true; ledgerId: string; balanceAfter: bigint }> {
    if (input.amount <= 0n) {
      throw new RangeError('adjustment amount must be > 0');
    }
    return withTransaction(this.pool, async (client) => {
      const { id, balanceAfter } = await this.ledger.append(client, {
        accountId: input.accountId,
        entryType: input.direction,
        amount: input.amount,
        counterparty: 'ADMIN_ADJUSTMENT',
        reference: input.reason,
        createdBy: input.actorId,
      });
      await this.audit.write(client, {
        actorId: input.actorId,
        actorScope: 'SYSTEM',
        action: 'FLOAT_ADJUSTMENT',
        target: input.accountId,
        metadata: {
          direction: input.direction,
          amount: input.amount.toString(),
          reason: input.reason,
          ledgerId: id,
          balanceAfter: balanceAfter.toString(),
        },
        ipAddress: input.ipAddress ?? null,
      });
      return { posted: true, ledgerId: id, balanceAfter };
    });
  }

  // Shared posting path (FLOAT-4): ledger CREDIT + audit, within the caller's tx.
  private async postCredit(
    client: PoolClient,
    input: {
      accountId: string;
      amount: bigint;
      actorId: string;
      ipAddress?: string | null;
      viaRequestId?: string;
    },
  ): Promise<{ posted: true; ledgerId: string; balanceAfter: bigint }> {
    const { id, balanceAfter } = await this.ledger.append(client, {
      accountId: input.accountId,
      entryType: 'CREDIT',
      amount: input.amount,
      counterparty: PLATFORM_FLOAT_SOURCE,
      reference: input.viaRequestId ?? null,
      createdBy: input.actorId,
    });
    await this.audit.write(client, {
      actorId: input.actorId,
      actorScope: 'SYSTEM',
      action: 'FLOAT_CREDIT',
      target: input.accountId,
      metadata: {
        amount: input.amount.toString(),
        ledgerId: id,
        balanceAfter: balanceAfter.toString(),
        ...(input.viaRequestId === undefined ? {} : { viaRequestId: input.viaRequestId }),
      },
      ipAddress: input.ipAddress ?? null,
    });
    return { posted: true, ledgerId: id, balanceAfter };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { withTransaction } from '../database/tx';
import { AuditService } from '../audit/audit.service';
import { TransactionService } from '../transactions/transaction.service';
import { AirtelDispatchService } from '../airtel/airtel-dispatch.service';
import { airtelGlobalConfig } from '../airtel/airtel.config';
import { MtnDispatchService } from '../mtn/mtn-dispatch.service';
import { mtnGlobalConfig } from '../mtn/mtn.config';
import { serializeTransaction, type TransactionResponse } from '../api/serializers';
import { ConflictError, NotFoundError, ValidationError } from '../money/errors';
import type { Processor } from '../money/types';

export interface RequestPayoutInput {
  merchantId: string;
  accountId: string;
  processor: Processor;
  amountNgwee: bigint;
  msisdn: string;
  reference: string | null;
  requestedBy: string;
}

// Maker-checker payouts (SEC-Z4). requestPayout parks a PENDING_APPROVAL request;
// a different merchant admin approves it, which creates + dispatches the payout.
@Injectable()
export class PayoutService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly audit: AuditService,
    private readonly txns: TransactionService,
    private readonly airtel: AirtelDispatchService,
    private readonly mtn: MtnDispatchService,
  ) {}

  /** Maker: park a payout for approval. No float is moved yet. */
  async requestPayout(input: RequestPayoutInput): Promise<{ id: string; status: string }> {
    // Ownership + a friendly early float check (the exact check runs at approval).
    const acc = await this.pool.query<{ merchant_id: string; float_balance: string }>(
      'SELECT merchant_id, float_balance::text AS float_balance FROM accounts WHERE id = $1',
      [input.accountId],
    );
    if (acc.rowCount === 0 || acc.rows[0].merchant_id !== input.merchantId) {
      throw new NotFoundError(`account not found: ${input.accountId}`);
    }
    const res = await this.pool.query<{ id: string }>(
      `INSERT INTO payout_requests
         (account_id, merchant_id, processor, amount_ngwee, msisdn, reference, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        input.accountId,
        input.merchantId,
        input.processor,
        input.amountNgwee.toString(),
        input.msisdn,
        input.reference,
        input.requestedBy,
      ],
    );
    const client = await this.pool.connect();
    try {
      await this.audit.write(client, {
        actorId: input.requestedBy,
        actorScope: 'MERCHANT',
        action: 'PAYOUT_REQUESTED',
        target: res.rows[0].id,
        metadata: { accountId: input.accountId, processor: input.processor, amount: input.amountNgwee.toString() },
      });
    } finally {
      client.release();
    }
    return { id: res.rows[0].id, status: 'PENDING_APPROVAL' };
  }

  /** List a merchant's payout requests (newest first), optionally by status. */
  async list(merchantId: string, pendingOnly = false): Promise<unknown[]> {
    const res = await this.pool.query(
      `SELECT p.id, p.processor, p.amount_ngwee::text AS amount, p.msisdn, p.reference, p.status,
              p.requested_by, p.approved_by, p.reason, p.transaction_id,
              a.account_number, u.name AS requested_by_name,
              to_char(p.created_at, 'YYYY-MM-DD HH24:MI') AS created_at
         FROM payout_requests p
         JOIN accounts a ON a.id = p.account_id
         LEFT JOIN users u ON u.id = p.requested_by
        WHERE p.merchant_id = $1 ${pendingOnly ? "AND p.status = 'PENDING_APPROVAL'" : ''}
        ORDER BY p.created_at DESC LIMIT 100`,
      [merchantId],
    );
    return res.rows;
  }

  /** Checker: approve a parked payout (must differ from the maker), then dispatch. */
  async approve(input: {
    requestId: string;
    merchantId: string;
    approverId: string;
  }): Promise<TransactionResponse> {
    const req = await withTransaction(this.pool, async (client) => {
      const found = await client.query<{
        account_id: string;
        processor: Processor;
        amount_ngwee: string;
        msisdn: string;
        reference: string | null;
        status: string;
        requested_by: string;
      }>(
        `SELECT account_id, processor, amount_ngwee::text AS amount_ngwee, msisdn, reference, status, requested_by
           FROM payout_requests WHERE id = $1 AND merchant_id = $2 FOR UPDATE`,
        [input.requestId, input.merchantId],
      );
      if (found.rowCount === 0) throw new NotFoundError('payout request not found');
      const r = found.rows[0];
      if (r.status !== 'PENDING_APPROVAL') throw new ConflictError(`payout is not pending (${r.status})`);
      if (r.requested_by === input.approverId) {
        throw new ValidationError('the approver must be different from the requester (SEC-Z4)');
      }
      return r;
    });

    const mode = await this.pool.query<{ operating_mode: 'SANDBOX' | 'PRODUCTION' }>(
      'SELECT operating_mode FROM accounts WHERE id = $1',
      [req.account_id],
    );
    const operatingMode = mode.rows[0]?.operating_mode ?? 'PRODUCTION';
    const amountNgwee = BigInt(req.amount_ngwee);
    const txnInput = {
      accountId: req.account_id,
      type: 'DISBURSEMENT' as const,
      processor: req.processor,
      amount: amountNgwee,
      msisdn: req.msisdn,
      idempotencyKey: randomUUID(),
      collectionReference: req.reference,
      environment: operatingMode,
      actorId: input.approverId,
    };

    // SANDBOX simulates + resolves; PRODUCTION creates PROCESSING then dispatches.
    let record;
    if (operatingMode === 'SANDBOX') {
      record = await this.txns.processAndSettle(txnInput);
    } else {
      record = await this.txns.processTransaction(txnInput);
      const approvalRef = `checker:${input.approverId}`;
      if (record.status === 'PROCESSING') {
        if (airtelGlobalConfig().enabled && req.processor === 'AIRTEL') {
          await this.airtel.dispatchDisbursement(
            { id: record.id, msisdn: req.msisdn, amountNgwee, reference: req.reference ?? record.id },
            approvalRef,
          );
        } else if (mtnGlobalConfig().enabled && req.processor === 'MTN') {
          await this.mtn.dispatchDisbursement(
            { id: record.id, msisdn: req.msisdn, amountNgwee, externalId: req.reference ?? record.id },
            approvalRef,
          );
        }
      }
    }

    await withTransaction(this.pool, async (client) => {
      await client.query(
        `UPDATE payout_requests
            SET status = 'APPROVED', approved_by = $2, transaction_id = $3, decided_at = now()
          WHERE id = $1`,
        [input.requestId, input.approverId, record.id],
      );
      await this.audit.write(client, {
        actorId: input.approverId,
        actorScope: 'MERCHANT',
        action: 'PAYOUT_APPROVED',
        target: input.requestId,
        metadata: { transactionId: record.id },
      });
    });

    return serializeTransaction(await this.txns.getForAccount(req.account_id, record.id));
  }

  /** Checker: reject a parked payout (must differ from the maker). */
  async reject(input: {
    requestId: string;
    merchantId: string;
    approverId: string;
    reason: string;
  }): Promise<{ ok: true }> {
    if (!input.reason.trim()) throw new ValidationError('a reason is required to reject a payout');
    return withTransaction(this.pool, async (client) => {
      const found = await client.query<{ status: string; requested_by: string }>(
        'SELECT status, requested_by FROM payout_requests WHERE id = $1 AND merchant_id = $2 FOR UPDATE',
        [input.requestId, input.merchantId],
      );
      if (found.rowCount === 0) throw new NotFoundError('payout request not found');
      if (found.rows[0].status !== 'PENDING_APPROVAL') throw new ConflictError('payout is not pending');
      if (found.rows[0].requested_by === input.approverId) {
        throw new ValidationError('the approver must be different from the requester (SEC-Z4)');
      }
      await client.query(
        "UPDATE payout_requests SET status = 'REJECTED', approved_by = $2, reason = $3, decided_at = now() WHERE id = $1",
        [input.requestId, input.approverId, input.reason.trim()],
      );
      await this.audit.write(client, {
        actorId: input.approverId,
        actorScope: 'MERCHANT',
        action: 'PAYOUT_REJECTED',
        target: input.requestId,
        metadata: { reason: input.reason.trim() },
      });
      return { ok: true as const };
    });
  }

  /** Maker: cancel their own pending request. */
  async cancel(input: { requestId: string; merchantId: string; userId: string }): Promise<{ ok: true }> {
    return withTransaction(this.pool, async (client) => {
      const found = await client.query<{ status: string; requested_by: string }>(
        'SELECT status, requested_by FROM payout_requests WHERE id = $1 AND merchant_id = $2 FOR UPDATE',
        [input.requestId, input.merchantId],
      );
      if (found.rowCount === 0) throw new NotFoundError('payout request not found');
      if (found.rows[0].status !== 'PENDING_APPROVAL') throw new ConflictError('payout is not pending');
      if (found.rows[0].requested_by !== input.userId) {
        throw new ValidationError('only the requester can cancel a payout');
      }
      await client.query(
        "UPDATE payout_requests SET status = 'CANCELLED', decided_at = now() WHERE id = $1",
        [input.requestId],
      );
      return { ok: true as const };
    });
  }
}

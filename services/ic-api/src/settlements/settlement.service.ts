import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { withTransaction } from '../database/tx';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { ConflictError, NotFoundError } from '../money/errors';

const BANK_SETTLEMENT = 'BANK_SETTLEMENT';

export interface SettlementRunResult {
  created: boolean;
  settlementId: string | null;
  amount: bigint;
}

interface TotalRow {
  total: string;
}
interface SettlementRow {
  account_id: string;
  amount: string;
  status: string;
}

/**
 * Settlements (§5.8).
 *
 * SET-1: settleable = Σ net_amount(SUCCESS collections) − Σ amount(settlements
 *        already PENDING or SETTLED). net_amount already nets the charge per
 *        fulfiller (CHG-4/5), so it is the right figure for "collections − charges".
 * SET-2: PENDING → SETTLED (bank confirmed) or → FAILED (funds retained = the row
 *        no longer counts as already-settled, so it returns to settleable).
 * SET-3: a SETTLED settlement writes a float_ledger entry (the payout).
 *
 * NETTING NOTE (flagged for the business): the §5.3 flow debits float on a
 * collection (TXN-3) and this records the payout as another DEBIT. The exact
 * collection-vs-settlement netting is a policy decision; this implementation
 * keeps float_ledger the single balance source of truth (NN-2) and treats a
 * settlement as a payout DEBIT against the account.
 */
@Injectable()
export class SettlementService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  /** SET-1: compute and (if positive) create a PENDING settlement for one account. */
  async runForAccount(accountId: string, actorId?: string | null): Promise<SettlementRunResult> {
    return withTransaction(this.pool, async (client) => {
      // Serialize settlement runs for the account.
      await client.query('SELECT 1 FROM accounts WHERE id = $1 FOR UPDATE', [accountId]);

      const collected = await client.query<TotalRow>(
        `SELECT COALESCE(SUM(net_amount), 0)::text AS total FROM transactions
           WHERE account_id = $1 AND type = 'COLLECTION' AND status = 'SUCCESS'`,
        [accountId],
      );
      const reserved = await client.query<TotalRow>(
        `SELECT COALESCE(SUM(amount), 0)::text AS total FROM settlements
           WHERE account_id = $1 AND status IN ('PENDING', 'SETTLED')`,
        [accountId],
      );
      const settleable = BigInt(collected.rows[0].total) - BigInt(reserved.rows[0].total);
      if (settleable <= 0n) {
        return { created: false, settlementId: null, amount: 0n };
      }

      const created = await client.query<{ id: string }>(
        "INSERT INTO settlements (account_id, amount, status) VALUES ($1, $2, 'PENDING') RETURNING id",
        [accountId, settleable.toString()],
      );
      const settlementId = created.rows[0].id;
      await this.audit.write(client, {
        actorId: actorId ?? null,
        actorScope: 'SYSTEM',
        action: 'SETTLEMENT_CREATED',
        target: settlementId,
        metadata: { accountId, amount: settleable.toString() },
      });
      return { created: true, settlementId, amount: settleable };
    });
  }

  /** Scheduled run across every account with successful collections. */
  async runAll(actorId?: string | null): Promise<{ created: number }> {
    const accounts = await this.pool.query<{ account_id: string }>(
      "SELECT DISTINCT account_id FROM transactions WHERE type = 'COLLECTION' AND status = 'SUCCESS'",
    );
    let created = 0;
    for (const row of accounts.rows) {
      const result = await this.runForAccount(row.account_id, actorId);
      if (result.created) created += 1;
    }
    return { created };
  }

  /** SET-2 + SET-3: confirm a settlement and record the payout ledger entry. */
  async confirmSettlement(input: {
    settlementId: string;
    actorId?: string | null;
    bankReference?: string | null;
  }): Promise<{ settlementId: string; status: 'SETTLED' }> {
    return withTransaction(this.pool, async (client) => {
      const settlement = await this.lockPending(client, input.settlementId);

      // SET-3: every settlement writes a ledger entry (append-only, NN-2).
      await this.ledger.append(client, {
        accountId: settlement.account_id,
        entryType: 'DEBIT',
        amount: BigInt(settlement.amount),
        counterparty: BANK_SETTLEMENT,
        reference: input.settlementId,
        createdBy: input.actorId ?? null,
      });
      await client.query(
        "UPDATE settlements SET status = 'SETTLED', settled_at = now() WHERE id = $1",
        [input.settlementId],
      );
      await this.audit.write(client, {
        actorId: input.actorId ?? null,
        actorScope: 'SYSTEM',
        action: 'SETTLEMENT_SETTLED',
        target: input.settlementId,
        metadata: {
          amount: settlement.amount,
          ...(input.bankReference ? { bankReference: input.bankReference } : {}),
        },
      });
      return { settlementId: input.settlementId, status: 'SETTLED' };
    });
  }

  /** SET-2: fail a settlement (funds retained → re-settleable next run; flagged). */
  async failSettlement(input: {
    settlementId: string;
    actorId?: string | null;
    reason: string;
  }): Promise<{ settlementId: string; status: 'FAILED' }> {
    return withTransaction(this.pool, async (client) => {
      await this.lockPending(client, input.settlementId);
      await client.query("UPDATE settlements SET status = 'FAILED' WHERE id = $1", [
        input.settlementId,
      ]);
      await this.audit.write(client, {
        actorId: input.actorId ?? null,
        actorScope: 'SYSTEM',
        action: 'SETTLEMENT_FAILED',
        target: input.settlementId,
        metadata: { reason: input.reason }, // flag for manual review (SET-2)
      });
      return { settlementId: input.settlementId, status: 'FAILED' };
    });
  }

  private async lockPending(client: PoolClient, settlementId: string): Promise<SettlementRow> {
    const found = await client.query<SettlementRow>(
      'SELECT account_id, amount, status FROM settlements WHERE id = $1 FOR UPDATE',
      [settlementId],
    );
    if (found.rowCount === 0) {
      throw new NotFoundError(`settlement not found: ${settlementId}`);
    }
    if (found.rows[0].status !== 'PENDING') {
      throw new ConflictError(`settlement is not PENDING (${found.rows[0].status})`);
    }
    return found.rows[0];
  }
}

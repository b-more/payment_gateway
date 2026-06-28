import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { InsufficientFloatError } from '../money/errors';
import type { LedgerEntryType } from '../money/types';

export interface LedgerAppend {
  accountId: string;
  entryType: LedgerEntryType;
  amount: bigint; // positive ngwee (4.6)
  reference?: string | null;
  counterparty?: string | null;
  createdBy?: string | null;
}

export interface LedgerResult {
  id: string;
  balanceAfter: bigint;
}

interface BalanceRow {
  float_balance: string;
}
interface IdRow {
  id: string;
}

/**
 * Double-entry float ledger writer (NN-2). Append-only: it INSERTs a new row and
 * refreshes the cached `accounts.float_balance`; it never updates or deletes an
 * existing ledger row. Corrections are new compensating entries (STATE-3).
 */
@Injectable()
export class LedgerService {
  /**
   * Append one ledger entry. MUST be called inside an open transaction. Locks
   * the account row (TXN-1), derives `balance_after` from the locked balance,
   * and writes the cache. CREDIT raises the balance; DEBIT lowers it and is
   * rejected if it would go negative (also guarded by a DB CHECK).
   */
  async append(client: PoolClient, entry: LedgerAppend): Promise<LedgerResult> {
    if (entry.amount <= 0n) {
      throw new RangeError('ledger amount must be > 0');
    }

    const locked = await client.query<BalanceRow>(
      'SELECT float_balance FROM accounts WHERE id = $1 FOR UPDATE',
      [entry.accountId],
    );
    if (locked.rowCount === 0) {
      throw new Error(`account not found: ${entry.accountId}`);
    }

    const current = BigInt(locked.rows[0].float_balance);
    const balanceAfter = entry.entryType === 'CREDIT' ? current + entry.amount : current - entry.amount;
    if (balanceAfter < 0n) {
      throw new InsufficientFloatError();
    }

    const inserted = await client.query<IdRow>(
      `INSERT INTO float_ledger
         (account_id, entry_type, amount, balance_after, reference, counterparty, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        entry.accountId,
        entry.entryType,
        entry.amount.toString(),
        balanceAfter.toString(),
        entry.reference ?? null,
        entry.counterparty ?? null,
        entry.createdBy ?? null,
      ],
    );

    await client.query('UPDATE accounts SET float_balance = $1 WHERE id = $2', [
      balanceAfter.toString(),
      entry.accountId,
    ]);

    return { id: inserted.rows[0].id, balanceAfter };
  }
}

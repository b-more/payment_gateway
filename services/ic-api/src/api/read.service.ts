import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { NotFoundError } from '../money/errors';
import type { OperatingMode } from '../money/types';
import type { TransactionResponse } from './serializers';

export interface TransactionPage {
  items: TransactionResponse[];
  next_cursor: string | null;
}

interface TxnListRow {
  id: string;
  type: string;
  processor: string;
  msisdn: string | null;
  amount: string;
  charge: string;
  net_amount: string;
  total_amount: string;
  status: string;
  failure_reason: string | null;
  idempotency_key: string;
  collection_reference: string | null;
  environment: string;
  created_at: Date;
}

const MAX_PAGE = 50;

/** Encode/decode a keyset cursor as base64(`<createdAtIso>|<id>`). */
function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}
function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const [createdAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export interface BalanceResponse {
  account_id: string;
  float_balance: string;
  low_float_threshold: string;
  operating_mode: OperatingMode;
}

export interface SettlementResponse {
  id: string;
  amount: string;
  status: string;
  settled_at: string | null;
  created_at: string;
}

interface AccountRow {
  float_balance: string;
  low_float_threshold: string;
  operating_mode: OperatingMode;
}
interface SettlementRow {
  id: string;
  amount: string;
  status: string;
  settled_at: Date | null;
  created_at: Date;
}

/** Read-only projections for the account-scoped GET endpoints (§8). */
@Injectable()
export class ApiReadService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getBalance(accountId: string): Promise<BalanceResponse> {
    const result = await this.pool.query<AccountRow>(
      'SELECT float_balance, low_float_threshold, operating_mode FROM accounts WHERE id = $1',
      [accountId],
    );
    if (result.rowCount === 0) {
      throw new NotFoundError(`account not found: ${accountId}`);
    }
    const row = result.rows[0];
    return {
      account_id: accountId,
      float_balance: row.float_balance,
      low_float_threshold: row.low_float_threshold,
      operating_mode: row.operating_mode,
    };
  }

  /**
   * Device-/account-scoped transaction history for the POS terminal. Newest
   * first, keyset-paginated. When `deviceId` is set (a device credential) the
   * list is filtered to that terminal; otherwise it is the whole account.
   */
  async listTransactions(opts: {
    accountId: string;
    deviceId: string | null;
    limit: number | undefined;
    cursor: string | undefined;
    status: string | undefined;
  }): Promise<TransactionPage> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), MAX_PAGE);
    const params: unknown[] = [opts.accountId];
    const where: string[] = ['account_id = $1'];

    if (opts.deviceId) {
      params.push(opts.deviceId);
      where.push(`device_id = $${params.length}`);
    }
    if (opts.status) {
      params.push(opts.status);
      where.push(`status = $${params.length}::transaction_status`);
    }
    if (opts.cursor) {
      const c = decodeCursor(opts.cursor);
      if (c) {
        params.push(c.createdAt, c.id);
        where.push(`(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
      }
    }
    params.push(limit + 1); // fetch one extra to detect a next page

    const result = await this.pool.query<TxnListRow>(
      `SELECT id, type, processor, msisdn, amount::text, charge::text, net_amount::text,
              total_amount::text, status, failure_reason, idempotency_key, collection_reference,
              environment, created_at
         FROM transactions
        WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC, id DESC
        LIMIT $${params.length}`,
      params,
    );

    const rows = result.rows;
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        id: r.id,
        type: r.type,
        processor: r.processor,
        msisdn: r.msisdn,
        amount: r.amount,
        charge: r.charge,
        net_amount: r.net_amount,
        total_amount: r.total_amount,
        status: r.status,
        failure_reason: r.failure_reason,
        idempotency_key: r.idempotency_key,
        collection_reference: r.collection_reference,
        environment: r.environment,
      })),
      next_cursor: hasMore && last ? encodeCursor(last.created_at, last.id) : null,
    };
  }

  async listSettlements(accountId: string): Promise<SettlementResponse[]> {
    const result = await this.pool.query<SettlementRow>(
      `SELECT id, amount, status, settled_at, created_at
         FROM settlements WHERE account_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [accountId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      amount: row.amount,
      status: row.status,
      settled_at: row.settled_at === null ? null : row.settled_at.toISOString(),
      created_at: row.created_at.toISOString(),
    }));
  }
}

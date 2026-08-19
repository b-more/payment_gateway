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

export interface ReportSummaryResponse {
  range: string;
  from: string;
  collections: { count: number; gross: string; charges: string; net: string };
  payouts: { count: number; total: string };
  rails: { processor: string; count: number; gross: string }[];
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

  /**
   * A takings summary for the POS "Reports" screen. Device-scoped when a
   * terminal credential is used, otherwise account-wide. Range is a fixed
   * window (today / last 7 / last 30 days) so the terminal never sends dates.
   */
  async reportSummary(opts: {
    accountId: string;
    deviceId: string | null;
    range: string | undefined;
  }): Promise<ReportSummaryResponse> {
    const range = opts.range === '7d' || opts.range === '30d' || opts.range === 'today' ? opts.range : 'today';
    const fromExpr =
      range === 'today'
        ? "date_trunc('day', now())"
        : range === '7d'
          ? "now() - interval '7 days'"
          : "now() - interval '30 days'";

    const params: unknown[] = [opts.accountId];
    let scope = 'account_id = $1';
    if (opts.deviceId) {
      params.push(opts.deviceId);
      scope += ` AND device_id = $${params.length}`;
    }
    const where = `${scope} AND created_at >= ${fromExpr}`;

    const totals = await this.pool.query<{
      from: Date;
      coll_count: string;
      gross: string;
      charges: string;
      net: string;
      payout_count: string;
      payout_total: string;
    }>(
      `SELECT ${fromExpr} AS from,
              COUNT(*) FILTER (WHERE type = 'COLLECTION' AND status = 'SUCCESS')::text AS coll_count,
              COALESCE(SUM(amount) FILTER (WHERE type = 'COLLECTION' AND status = 'SUCCESS'), 0)::text AS gross,
              COALESCE(SUM(charge) FILTER (WHERE type = 'COLLECTION' AND status = 'SUCCESS'), 0)::text AS charges,
              COALESCE(SUM(net_amount) FILTER (WHERE type = 'COLLECTION' AND status = 'SUCCESS'), 0)::text AS net,
              COUNT(*) FILTER (WHERE type = 'DISBURSEMENT' AND status = 'SUCCESS')::text AS payout_count,
              COALESCE(SUM(amount) FILTER (WHERE type = 'DISBURSEMENT' AND status = 'SUCCESS'), 0)::text AS payout_total
         FROM transactions WHERE ${where}`,
      params,
    );

    const rails = await this.pool.query<{ processor: string; count: string; gross: string }>(
      `SELECT processor, COUNT(*)::text AS count, COALESCE(SUM(amount), 0)::text AS gross
         FROM transactions
        WHERE ${where} AND type = 'COLLECTION' AND status = 'SUCCESS'
        GROUP BY processor ORDER BY SUM(amount) DESC`,
      params,
    );

    const t = totals.rows[0];
    return {
      range,
      from: t.from.toISOString(),
      collections: { count: Number(t.coll_count), gross: t.gross, charges: t.charges, net: t.net },
      payouts: { count: Number(t.payout_count), total: t.payout_total },
      rails: rails.rows.map((r) => ({ processor: r.processor, count: Number(r.count), gross: r.gross })),
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

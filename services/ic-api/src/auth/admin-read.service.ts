import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { NotFoundError } from '../money/errors';

// Read projections for the admin portal (§6.1). All money is returned as
// integer-ngwee strings (NN-1). Scope/role gating is applied at the controller.

export interface DashboardSummary {
  totalCollections: string; // ngwee
  totalVolume: number;
  successRate: string; // percent, e.g. "97.50"
  byProcessor: Array<{ processor: string; count: number; amount: string }>;
  byStatus: Array<{ status: string; count: number }>;
  trend: Array<{ day: string; amount: string }>;
}

@Injectable()
export class AdminReadService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async dashboard(filter: { accountId?: string | null }): Promise<DashboardSummary> {
    const account = filter.accountId ?? null;
    const summary = await this.pool.query<{
      total_collections: string;
      total_volume: string;
      success_rate: string;
    }>(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE status = 'SUCCESS' AND type = 'COLLECTION'), 0)::text AS total_collections,
         COUNT(*)::text AS total_volume,
         COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'SUCCESS') / NULLIF(COUNT(*), 0), 2), 0)::text AS success_rate
       FROM transactions
       WHERE ($1::uuid IS NULL OR account_id = $1)`,
      [account],
    );

    const byProcessor = await this.pool.query<{ processor: string; count: string; amount: string }>(
      `SELECT processor, COUNT(*)::text AS count,
              COALESCE(SUM(amount) FILTER (WHERE status = 'SUCCESS'), 0)::text AS amount
         FROM transactions
        WHERE ($1::uuid IS NULL OR account_id = $1)
        GROUP BY processor ORDER BY processor`,
      [account],
    );
    const byStatus = await this.pool.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM transactions
        WHERE ($1::uuid IS NULL OR account_id = $1)
        GROUP BY status ORDER BY status`,
      [account],
    );
    const trend = await this.pool.query<{ day: string; amount: string }>(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
              COALESCE(SUM(amount) FILTER (WHERE status = 'SUCCESS' AND type = 'COLLECTION'), 0)::text AS amount
         FROM transactions
        WHERE ($1::uuid IS NULL OR account_id = $1)
          AND created_at >= now() - interval '30 days'
        GROUP BY 1 ORDER BY 1`,
      [account],
    );

    return {
      totalCollections: summary.rows[0].total_collections,
      totalVolume: Number(summary.rows[0].total_volume),
      successRate: summary.rows[0].success_rate,
      byProcessor: byProcessor.rows.map((r) => ({
        processor: r.processor,
        count: Number(r.count),
        amount: r.amount,
      })),
      byStatus: byStatus.rows.map((r) => ({ status: r.status, count: Number(r.count) })),
      trend: trend.rows.map((r) => ({ day: r.day, amount: r.amount })),
    };
  }

  async listMerchants(): Promise<unknown[]> {
    const res = await this.pool.query(
      `SELECT id, name, merchant_type, status, kyc_status,
              to_char(registered_at, 'YYYY-MM-DD') AS registered_at
         FROM merchants ORDER BY registered_at DESC LIMIT 200`,
    );
    return res.rows;
  }

  async merchantDetail(merchantId: string): Promise<unknown> {
    const merchant = await this.pool.query(
      `SELECT id, name, merchant_type, email, phone, status, kyc_status,
              trading_name, registration_number, tpin, address, city, website, description, review_reason,
              to_char(registered_at, 'YYYY-MM-DD') AS registered_at
         FROM merchants WHERE id = $1`,
      [merchantId],
    );
    if (merchant.rowCount === 0) throw new NotFoundError(`merchant not found: ${merchantId}`);
    // Primary contact = the merchant's first MERCHANT_ADMIN user.
    const contact = await this.pool.query(
      `SELECT name, email, phone FROM users
         WHERE merchant_id = $1 AND scope = 'MERCHANT'
         ORDER BY created_at LIMIT 1`,
      [merchantId],
    );
    const documents = await this.pool.query(
      `SELECT id, doc_type, file_name, content_type, byte_size, status,
              to_char(uploaded_at, 'YYYY-MM-DD HH24:MI') AS uploaded_at
         FROM merchant_documents WHERE merchant_id = $1 ORDER BY uploaded_at`,
      [merchantId],
    );
    const accounts = await this.pool.query(
      `SELECT id, account_number, account_type, operating_mode, status, float_balance::text AS float_balance,
              low_float_threshold::text AS low_float_threshold,
              to_char(created_at, 'YYYY-MM-DD') AS created_at
         FROM accounts WHERE merchant_id = $1 ORDER BY created_at`,
      [merchantId],
    );
    return {
      merchant: merchant.rows[0],
      contact: contact.rows[0] ?? null,
      documents: documents.rows,
      accounts: accounts.rows,
    };
  }

  /** Stream a single KYC document's bytes (admin-only download). */
  async merchantDocument(
    merchantId: string,
    docId: string,
  ): Promise<{ fileName: string; contentType: string; content: Buffer } | null> {
    const res = await this.pool.query<{ file_name: string; content_type: string; content: Buffer }>(
      `SELECT file_name, content_type, content
         FROM merchant_documents WHERE id = $1 AND merchant_id = $2`,
      [docId, merchantId],
    );
    if (res.rowCount === 0) return null;
    const row = res.rows[0];
    return { fileName: row.file_name, contentType: row.content_type, content: row.content };
  }

  async listTransactions(filter: { status?: string | null; accountId?: string | null }): Promise<unknown[]> {
    const res = await this.pool.query(
      `SELECT id, account_id, type, processor, msisdn,
              amount::text AS amount, charge::text AS charge, net_amount::text AS net_amount,
              status, failure_reason, environment,
              to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
         FROM transactions
        WHERE ($1::text IS NULL OR status = $1::transaction_status)
          AND ($2::uuid IS NULL OR account_id = $2)
        ORDER BY created_at DESC LIMIT 100`,
      [filter.status ?? null, filter.accountId ?? null],
    );
    return res.rows;
  }

  async listSettlements(): Promise<unknown[]> {
    // Joined so an operator can see WHO they're paying without cross-referencing ids.
    const res = await this.pool.query(
      `SELECT s.id, s.account_id, s.amount::text AS amount, s.status,
              to_char(s.settled_at, 'YYYY-MM-DD HH24:MI') AS settled_at,
              to_char(s.created_at, 'YYYY-MM-DD HH24:MI') AS created_at,
              a.account_number, a.operating_mode, m.name AS merchant_name
         FROM settlements s
         JOIN accounts a ON a.id = s.account_id
         JOIN merchants m ON m.id = a.merchant_id
        ORDER BY s.created_at DESC LIMIT 100`,
    );
    return res.rows;
  }

  async listFloatRequests(status: string): Promise<unknown[]> {
    const res = await this.pool.query(
      `SELECT r.id, r.account_id, r.amount::text AS amount, r.status, r.reason,
              to_char(r.created_at, 'YYYY-MM-DD HH24:MI') AS created_at,
              to_char(r.decided_at, 'YYYY-MM-DD HH24:MI') AS decided_at,
              r.requested_by, ru.name AS requested_by_name, ru.email AS requested_by_email,
              r.approved_by, au.name AS decided_by_name,
              r.proof_file_name, r.proof_content_type, r.proof_byte_size,
              (r.proof_content IS NOT NULL) AS has_proof,
              m.name AS merchant_name, a.account_type, a.operating_mode
         FROM float_credit_requests r
         JOIN accounts a ON a.id = r.account_id
         JOIN merchants m ON m.id = a.merchant_id
         LEFT JOIN users ru ON ru.id = r.requested_by
         LEFT JOIN users au ON au.id = r.approved_by
        WHERE r.status = $1::float_request_status
        ORDER BY r.created_at DESC LIMIT 100`,
      [status],
    );
    return res.rows;
  }

  /** All accounts with their current float balance (for the Float Management overview). */
  async listAccounts(): Promise<unknown[]> {
    const res = await this.pool.query(
      `SELECT a.id, a.account_number, m.name AS merchant_name, a.account_type, a.operating_mode, a.status,
              a.float_balance::text AS float_balance, a.low_float_threshold::text AS low_float_threshold
         FROM accounts a JOIN merchants m ON m.id = a.merchant_id
        ORDER BY m.name, a.account_type, a.operating_mode`,
    );
    return res.rows;
  }

  /** Stream a float credit request's proof-of-payment bytes (admin-only download). */
  async floatRequestProof(
    requestId: string,
  ): Promise<{ fileName: string; contentType: string; content: Buffer } | null> {
    const res = await this.pool.query<{
      proof_file_name: string | null;
      proof_content_type: string | null;
      proof_content: Buffer | null;
    }>(
      'SELECT proof_file_name, proof_content_type, proof_content FROM float_credit_requests WHERE id = $1',
      [requestId],
    );
    if (res.rowCount === 0) return null;
    const row = res.rows[0];
    if (!row.proof_content || !row.proof_content_type || !row.proof_file_name) return null;
    return { fileName: row.proof_file_name, contentType: row.proof_content_type, content: row.proof_content };
  }

  async accountLedger(accountId: string): Promise<unknown[]> {
    const res = await this.pool.query(
      `SELECT entry_type, amount::text AS amount, balance_after::text AS balance_after,
              counterparty, reference, to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
         FROM float_ledger WHERE account_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [accountId],
    );
    return res.rows;
  }
}

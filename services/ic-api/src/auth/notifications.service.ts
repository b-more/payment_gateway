import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

// Operator alert centre (§6.1.8). Derives actionable alerts from signals the
// system already records — no separate notifications table. Covers low float
// (FLOAT-6), given-up webhooks (WH-4), reconciliation disputes (REC-3), pending
// dual-control approvals (FLOAT-3), failed settlements (SET-2), and account
// lockouts (SEC-AU4).
@Injectable()
export class NotificationsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(): Promise<unknown> {
    const lowFloat = await this.pool.query(
      `SELECT a.id AS account_id, m.name AS merchant,
              a.float_balance::text AS float_balance, a.low_float_threshold::text AS low_float_threshold
         FROM accounts a JOIN merchants m ON m.id = a.merchant_id
        WHERE a.low_float_threshold > 0 AND a.float_balance < a.low_float_threshold
        ORDER BY (a.low_float_threshold - a.float_balance) DESC LIMIT 50`,
    );
    const givenUpWebhooks = await this.pool.query(
      `SELECT id, transaction_id, url, attempt,
              to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
         FROM webhook_deliveries WHERE status = 'GIVEN_UP'
        ORDER BY created_at DESC LIMIT 50`,
    );
    const disputes = await this.pool.query(
      `SELECT id, transaction_id, internal_status, processor_status,
              to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
         FROM reconciliation_items WHERE result = 'DISPUTED'
        ORDER BY created_at DESC LIMIT 50`,
    );
    const pendingApprovals = await this.pool.query(
      `SELECT id, account_id, amount::text AS amount, requested_by,
              to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
         FROM float_credit_requests WHERE status = 'PENDING_APPROVAL'
        ORDER BY created_at DESC LIMIT 50`,
    );
    const failedSettlements = await this.pool.query(
      `SELECT id, account_id, amount::text AS amount,
              to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
         FROM settlements WHERE status = 'FAILED'
        ORDER BY created_at DESC LIMIT 50`,
    );
    const lockouts = await this.pool.query(
      `SELECT id, email, to_char(locked_until, 'YYYY-MM-DD HH24:MI') AS locked_until
         FROM users WHERE locked_until > now()
        ORDER BY locked_until DESC LIMIT 50`,
    );

    return {
      counts: {
        lowFloat: lowFloat.rowCount ?? 0,
        givenUpWebhooks: givenUpWebhooks.rowCount ?? 0,
        disputes: disputes.rowCount ?? 0,
        pendingApprovals: pendingApprovals.rowCount ?? 0,
        failedSettlements: failedSettlements.rowCount ?? 0,
        lockouts: lockouts.rowCount ?? 0,
      },
      lowFloat: lowFloat.rows,
      givenUpWebhooks: givenUpWebhooks.rows,
      disputes: disputes.rows,
      pendingApprovals: pendingApprovals.rows,
      failedSettlements: failedSettlements.rows,
      lockouts: lockouts.rows,
    };
  }
}

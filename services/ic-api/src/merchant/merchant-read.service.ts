import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { withTransaction } from '../database/tx';
import { AuditService } from '../audit/audit.service';
import { CredentialService, type GeneratedCredential } from '../credentials/credential.service';
import { generateWebhookSecret } from '../credentials/crypto';
import { ForbiddenError, NotFoundError, ValidationError } from '../money/errors';
import { assertSafeWebhookUrl, UnsafeWebhookUrlError } from '../webhooks/ssrf-guard';

// Every method is scoped to the authenticated merchant's accounts (NN-6/SEC-Z2):
// the merchant id comes from the session principal, never the request body, and
// is applied at the data layer. Cross-merchant access yields nothing / 404.

@Injectable()
export class MerchantReadService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly audit: AuditService,
    private readonly credentials: CredentialService,
  ) {}

  async dashboard(merchantId: string): Promise<unknown> {
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
       WHERE account_id IN (SELECT id FROM accounts WHERE merchant_id = $1)`,
      [merchantId],
    );
    const byProcessor = await this.pool.query<{ processor: string; count: string; amount: string }>(
      `SELECT processor, COUNT(*)::text AS count,
              COALESCE(SUM(amount) FILTER (WHERE status = 'SUCCESS'), 0)::text AS amount
         FROM transactions
        WHERE account_id IN (SELECT id FROM accounts WHERE merchant_id = $1)
        GROUP BY processor ORDER BY processor`,
      [merchantId],
    );
    const byStatus = await this.pool.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM transactions
        WHERE account_id IN (SELECT id FROM accounts WHERE merchant_id = $1)
        GROUP BY status ORDER BY status`,
      [merchantId],
    );
    const trend = await this.pool.query<{ day: string; amount: string }>(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
              COALESCE(SUM(amount) FILTER (WHERE status = 'SUCCESS' AND type = 'COLLECTION'), 0)::text AS amount
         FROM transactions
        WHERE account_id IN (SELECT id FROM accounts WHERE merchant_id = $1)
          AND created_at >= now() - interval '30 days'
        GROUP BY 1 ORDER BY 1`,
      [merchantId],
    );
    const profile = await this.pool.query<{ name: string; trading_name: string | null; status: string }>(
      'SELECT name, trading_name, status FROM merchants WHERE id = $1',
      [merchantId],
    );
    const m = profile.rows[0];
    return {
      merchantName: m?.trading_name || m?.name || null,
      merchantStatus: m?.status ?? null,
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

  async accounts(merchantId: string): Promise<unknown[]> {
    const res = await this.pool.query(
      `SELECT a.id, a.account_number, a.account_type, a.operating_mode, a.status,
              a.float_balance::text AS float_balance,
              s.callback_url, COALESCE(s.ip_whitelist, '{}') AS ip_whitelist,
              to_char(a.created_at, 'YYYY-MM-DD') AS created_at
         FROM accounts a LEFT JOIN account_settings s ON s.account_id = a.id
        WHERE a.merchant_id = $1 ORDER BY a.created_at`,
      [merchantId],
    );
    return res.rows;
  }

  async transactions(
    merchantId: string,
    filter: { msisdn?: string | null; reference?: string | null; processor?: string | null; status?: string | null },
  ): Promise<unknown[]> {
    const res = await this.pool.query(
      `SELECT t.id, t.account_id, t.type, t.processor, t.msisdn,
              t.amount::text AS amount, t.charge::text AS charge, t.net_amount::text AS net_amount,
              t.status, t.collection_reference, t.environment,
              to_char(t.created_at, 'YYYY-MM-DD HH24:MI') AS created_at
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
        WHERE a.merchant_id = $1
          AND ($2::text IS NULL OR t.msisdn = $2)
          AND ($3::text IS NULL OR t.collection_reference ILIKE '%' || $3 || '%')
          AND ($4::text IS NULL OR t.processor = $4::processor)
          AND ($5::text IS NULL OR t.status = $5::transaction_status)
        ORDER BY t.created_at DESC LIMIT 100`,
      [merchantId, filter.msisdn ?? null, filter.reference ?? null, filter.processor ?? null, filter.status ?? null],
    );
    return res.rows;
  }

  async settlements(merchantId: string): Promise<unknown[]> {
    const res = await this.pool.query(
      `SELECT s.id, s.account_id, s.amount::text AS amount, s.status, s.bank_details,
              to_char(s.settled_at, 'YYYY-MM-DD HH24:MI') AS settled_at,
              to_char(s.created_at, 'YYYY-MM-DD HH24:MI') AS created_at
         FROM settlements s JOIN accounts a ON a.id = s.account_id
        WHERE a.merchant_id = $1 ORDER BY s.created_at DESC LIMIT 100`,
      [merchantId],
    );
    return res.rows;
  }

  /** Public credential metadata only — never secret_hash or signing key. */
  async listCredentials(merchantId: string): Promise<unknown[]> {
    const res = await this.pool.query(
      `SELECT c.id, c.account_id, c.environment, c.api_key, c.status,
              to_char(c.last_rotated_at, 'YYYY-MM-DD HH24:MI') AS last_rotated_at
         FROM api_credentials c JOIN accounts a ON a.id = c.account_id
        WHERE a.merchant_id = $1 ORDER BY c.environment`,
      [merchantId],
    );
    return res.rows;
  }

  async users(merchantId: string): Promise<unknown[]> {
    const res = await this.pool.query(
      `SELECT id, name, email, status, email_verified FROM users
        WHERE merchant_id = $1 AND scope = 'MERCHANT' ORDER BY name`,
      [merchantId],
    );
    return res.rows;
  }

  /** Update an account's webhook URL + IP whitelist (§6.2.7). Owner-checked. */
  async updateSettings(
    merchantId: string,
    accountId: string,
    input: { callbackUrl?: string | null; ipWhitelist?: string[] | null },
    actorId: string,
  ): Promise<{ accountId: string }> {
    // Reject an unsafe webhook URL up front (SSRF), so merchants get immediate
    // feedback rather than silent give-ups at delivery time.
    if (input.callbackUrl) {
      try {
        await assertSafeWebhookUrl(input.callbackUrl);
      } catch (e) {
        if (e instanceof UnsafeWebhookUrlError) throw new ValidationError(e.message);
        throw e;
      }
    }
    return withTransaction(this.pool, async (client) => {
      await this.assertOwned(client, merchantId, accountId);
      await client.query(
        `INSERT INTO account_settings (account_id, callback_url, ip_whitelist)
         VALUES ($1, $2, COALESCE($3::text[], '{}'::text[]))
         ON CONFLICT (account_id) DO UPDATE SET
           callback_url = COALESCE(EXCLUDED.callback_url, account_settings.callback_url),
           ip_whitelist = COALESCE($3::text[], account_settings.ip_whitelist)`,
        [accountId, input.callbackUrl ?? null, input.ipWhitelist ?? null],
      );
      await this.audit.write(client, {
        actorId,
        actorScope: 'MERCHANT',
        action: 'ACCOUNT_SETTINGS_UPDATED',
        target: accountId,
        metadata: { callbackUrl: input.callbackUrl ?? null, ipWhitelist: input.ipWhitelist ?? null },
      });
      return { accountId };
    });
  }

  /** Regenerate a credential pair for one environment (§6.2.7); old keys revoked. */
  async regenerateCredential(
    merchantId: string,
    accountId: string,
    environment: 'SANDBOX' | 'LIVE',
    actorId: string,
  ): Promise<GeneratedCredential> {
    return withTransaction(this.pool, async (client) => {
      await this.assertOwned(client, merchantId, accountId);
      await client.query(
        `UPDATE api_credentials SET status = 'REVOKED', last_rotated_at = now()
          WHERE account_id = $1 AND environment = $2 AND status = 'ACTIVE'`,
        [accountId, environment],
      );
      const cred = await this.credentials.generate({ accountId, environment }, client);
      await this.audit.write(client, {
        actorId,
        actorScope: 'MERCHANT',
        action: 'CREDENTIAL_ROTATED',
        target: cred.id,
        metadata: { accountId, environment, apiKey: cred.apiKey },
      });
      return cred;
    });
  }

  /** NN-6: assert the account belongs to the merchant and return its mode. */
  /**
   * Reveal the account's webhook signing secret (WH-2). Merchants need this to
   * verify the X-Instacompay-Signature on webhooks we send them — without it a
   * receiver cannot tell a real callback from a forged one. It is a symmetric
   * HMAC key (we hold it to sign), so revealing it to its owner is by design.
   */
  async webhookSecret(merchantId: string, accountId: string): Promise<{ webhookSecret: string }> {
    await this.assertOwnedAccount(merchantId, accountId);
    const res = await this.pool.query<{ webhook_signing_secret: string | null }>(
      'SELECT webhook_signing_secret FROM account_settings WHERE account_id = $1',
      [accountId],
    );
    const secret = res.rowCount === 0 ? null : res.rows[0].webhook_signing_secret;
    if (!secret) throw new NotFoundError('no webhook signing secret is set for this account');
    return { webhookSecret: secret };
  }

  /** Rotate the webhook signing secret. Old signatures stop verifying at once. */
  async rotateWebhookSecret(
    merchantId: string,
    accountId: string,
    actorId: string,
  ): Promise<{ webhookSecret: string }> {
    return withTransaction(this.pool, async (client) => {
      await this.assertOwned(client, merchantId, accountId);
      const next = generateWebhookSecret();
      await client.query(
        `INSERT INTO account_settings (account_id, webhook_signing_secret) VALUES ($1, $2)
         ON CONFLICT (account_id) DO UPDATE SET webhook_signing_secret = EXCLUDED.webhook_signing_secret`,
        [accountId, next],
      );
      await this.audit.write(client, {
        actorId,
        actorScope: 'MERCHANT',
        action: 'WEBHOOK_SECRET_ROTATED',
        target: accountId,
        metadata: {},
      });
      return { webhookSecret: next };
    });
  }

  async assertOwnedAccount(
    merchantId: string,
    accountId: string,
  ): Promise<{ operatingMode: 'SANDBOX' | 'PRODUCTION' }> {
    const res = await this.pool.query<{ merchant_id: string; operating_mode: 'SANDBOX' | 'PRODUCTION' }>(
      'SELECT merchant_id, operating_mode FROM accounts WHERE id = $1',
      [accountId],
    );
    if (res.rowCount === 0 || res.rows[0].merchant_id !== merchantId) {
      throw new NotFoundError(`account not found: ${accountId}`);
    }
    return { operatingMode: res.rows[0].operating_mode };
  }

  // NN-6: an account must belong to the authenticated merchant, else 404.
  private async assertOwned(client: PoolClient, merchantId: string, accountId: string): Promise<void> {
    const res = await client.query<{ merchant_id: string }>(
      'SELECT merchant_id FROM accounts WHERE id = $1',
      [accountId],
    );
    if (res.rowCount === 0 || res.rows[0].merchant_id !== merchantId) {
      throw new NotFoundError(`account not found: ${accountId}`);
    }
  }

  static requireMerchant(merchantId: string | null): string {
    if (!merchantId) throw new ForbiddenError('merchant scope required');
    return merchantId;
  }
}

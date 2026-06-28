import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { withTransaction } from '../database/tx';
import { AuditService } from '../audit/audit.service';
import { CredentialService } from '../credentials/credential.service';
import { generateWebhookSecret, hashSecret } from '../credentials/crypto';
import { EmailService } from '../email/email.service';
import { ConflictError, NotFoundError } from '../money/errors';
import type { AccountType } from '../money/types';

/** A readable, strong one-time portal password (12 url-safe chars). */
function generateTempPassword(): string {
  return randomBytes(9).toString('base64url');
}

export interface CredentialPair {
  apiKey: string;
  secret: string; // shown ONCE (ONB-5, NN-7)
  signingKey: string; // shown ONCE
}

export interface ProvisionResult {
  accountId: string;
  accountNumber: string;
  credentials: { sandbox: CredentialPair; live: CredentialPair };
}

interface MerchantRow {
  status: string;
  name: string;
  email: string;
}
interface ModeRow {
  operating_mode: string;
}

/**
 * Account + credential provisioning (ONB-4..8). On approval an admin provisions
 * an account: it starts SANDBOX with zero float (ONB-6/NN-10), gets a webhook
 * signing secret, and is issued BOTH a SANDBOX and a LIVE credential pair whose
 * secrets are returned exactly once (ONB-5). Promotion to PRODUCTION is deliberate
 * and audit-logged (ONB-8).
 */
@Injectable()
export class AccountProvisioningService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly credentials: CredentialService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  async provisionAccount(input: {
    merchantId: string;
    accountType: AccountType;
    actorId: string;
  }): Promise<ProvisionResult> {
    const result = await withTransaction(this.pool, async (client) => {
      const merchant = await client.query<MerchantRow>(
        'SELECT status, name, email FROM merchants WHERE id = $1 FOR UPDATE',
        [input.merchantId],
      );
      if (merchant.rowCount === 0) {
        throw new NotFoundError(`merchant not found: ${input.merchantId}`);
      }
      if (merchant.rows[0].status !== 'APPROVED') {
        throw new ConflictError('merchant must be APPROVED before provisioning accounts'); // ONB-4
      }

      // ONB-6 / NN-10: defaults are SANDBOX + zero float (set by the schema).
      // account_number is assigned by the trg_account_number trigger (0013).
      const account = await client.query<{ id: string; account_number: string }>(
        'INSERT INTO accounts (merchant_id, account_type) VALUES ($1, $2) RETURNING id, account_number',
        [input.merchantId, input.accountType],
      );
      const accountId = account.rows[0].id;
      const accountNumber = account.rows[0].account_number;

      await client.query(
        'INSERT INTO account_settings (account_id, webhook_signing_secret) VALUES ($1, $2)',
        [accountId, generateWebhookSecret()], // sign outgoing webhooks (WH-2)
      );

      // ONB-4: auto-generate a SANDBOX and a LIVE credential pair, atomically.
      const sandbox = await this.credentials.generate({ accountId, environment: 'SANDBOX' }, client);
      const live = await this.credentials.generate({ accountId, environment: 'LIVE' }, client);

      await this.audit.write(client, {
        actorId: input.actorId,
        actorScope: 'SYSTEM',
        action: 'ACCOUNT_CREATED',
        target: accountId,
        metadata: { merchantId: input.merchantId, accountType: input.accountType },
      });
      for (const cred of [sandbox, live]) {
        await this.audit.write(client, {
          actorId: input.actorId,
          actorScope: 'SYSTEM',
          action: 'CREDENTIAL_GENERATED',
          target: cred.id,
          metadata: { accountId, apiKey: cred.apiKey },
        });
      }

      // §7.1: grant portal access. Any merchant admin user without a password
      // yet (i.e. first provisioning) gets a temporary one, emailed below. On
      // later provisioning they already have a password, so none is issued.
      const pendingUsers = await client.query<{ id: string; email: string }>(
        "SELECT id, email FROM users WHERE merchant_id = $1 AND scope = 'MERCHANT' AND password_hash IS NULL",
        [input.merchantId],
      );
      const portalInvites: Array<{ email: string; tempPassword: string }> = [];
      for (const u of pendingUsers.rows) {
        const tempPassword = generateTempPassword();
        await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
          await hashSecret(tempPassword),
          u.id,
        ]);
        portalInvites.push({ email: u.email, tempPassword });
        await this.audit.write(client, {
          actorId: input.actorId,
          actorScope: 'SYSTEM',
          action: 'PORTAL_ACCESS_GRANTED',
          target: u.id,
          metadata: { merchantId: input.merchantId },
        });
      }

      return {
        accountId,
        accountNumber,
        merchant: merchant.rows[0],
        portalInvites,
        credentials: {
          sandbox: { apiKey: sandbox.apiKey, secret: sandbox.secret, signingKey: sandbox.signingKey },
          live: { apiKey: live.apiKey, secret: live.secret, signingKey: live.signingKey },
        },
      };
    });

    // ONB-7: welcome email (after commit; never includes secrets). Shows the
    // human-readable account number rather than the internal UUID.
    await this.email.sendWelcome({
      to: result.merchant.email,
      merchantName: result.merchant.name,
      accountId: result.accountNumber,
      sandboxApiKey: result.credentials.sandbox.apiKey,
    });

    // §7.1: email the merchant admin user(s) their portal login details, so the
    // person who applied can actually sign in. Best-effort, like the welcome.
    for (const invite of result.portalInvites) {
      await this.email.sendPortalCredentials({
        to: invite.email,
        loginEmail: invite.email,
        tempPassword: invite.tempPassword,
      });
    }

    return {
      accountId: result.accountId,
      accountNumber: result.accountNumber,
      credentials: result.credentials,
    };
  }

  /**
   * Reset a merchant's portal login (§7.1): issue a fresh temporary password to
   * each of the merchant's portal user(s), revoke their live sessions, and email
   * the new credentials. Used by admins when a merchant is locked out or never
   * received their details.
   */
  async resetPortalCredentials(input: {
    merchantId: string;
    actorId: string;
  }): Promise<{ sentTo: string[] }> {
    const result = await withTransaction(this.pool, async (client) => {
      const merchant = await client.query<{ id: string }>(
        'SELECT id FROM merchants WHERE id = $1',
        [input.merchantId],
      );
      if (merchant.rowCount === 0) {
        throw new NotFoundError(`merchant not found: ${input.merchantId}`);
      }
      const users = await client.query<{ id: string; email: string }>(
        "SELECT id, email FROM users WHERE merchant_id = $1 AND scope = 'MERCHANT' ORDER BY created_at",
        [input.merchantId],
      );
      if (users.rowCount === 0) {
        throw new ConflictError('this merchant has no portal users to reset');
      }

      const invites: Array<{ email: string; tempPassword: string }> = [];
      for (const u of users.rows) {
        const tempPassword = generateTempPassword();
        await client.query(
          'UPDATE users SET password_hash = $1, failed_login_count = 0, locked_until = NULL WHERE id = $2',
          [await hashSecret(tempPassword), u.id],
        );
        // Kill any live sessions so the old password can't keep a session alive.
        await client.query(
          'UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
          [u.id],
        );
        invites.push({ email: u.email, tempPassword });
        await this.audit.write(client, {
          actorId: input.actorId,
          actorScope: 'SYSTEM',
          action: 'PORTAL_CREDENTIALS_RESET',
          target: u.id,
          metadata: { merchantId: input.merchantId },
        });
      }
      return { invites };
    });

    // Best-effort email of the new credentials (after commit).
    for (const invite of result.invites) {
      await this.email.sendPortalCredentials({
        to: invite.email,
        loginEmail: invite.email,
        tempPassword: invite.tempPassword,
      });
    }
    return { sentTo: result.invites.map((i) => i.email) };
  }

  /** ONB-8: deliberately promote an account to PRODUCTION (audit-logged). */
  async promoteAccount(input: {
    accountId: string;
    actorId: string;
  }): Promise<{ accountId: string; operatingMode: 'PRODUCTION' }> {
    return withTransaction(this.pool, async (client) => {
      const found = await client.query<ModeRow>(
        'SELECT operating_mode FROM accounts WHERE id = $1 FOR UPDATE',
        [input.accountId],
      );
      if (found.rowCount === 0) {
        throw new NotFoundError(`account not found: ${input.accountId}`);
      }
      if (found.rows[0].operating_mode === 'PRODUCTION') {
        throw new ConflictError('account is already in PRODUCTION');
      }

      await client.query("UPDATE accounts SET operating_mode = 'PRODUCTION' WHERE id = $1", [
        input.accountId,
      ]);
      await this.audit.write(client, {
        actorId: input.actorId,
        actorScope: 'SYSTEM',
        action: 'MODE_CHANGED',
        target: input.accountId,
        metadata: { from: 'SANDBOX', to: 'PRODUCTION' },
      });
      return { accountId: input.accountId, operatingMode: 'PRODUCTION' };
    });
  }
}

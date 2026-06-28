import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { NotFoundError } from '../money/errors';
import type { ChargeFulfiller, ChargeType, OperatingMode, Processor } from '../money/types';

export interface ChargeConfigInput {
  processor: Processor;
  chargeFulfiller: ChargeFulfiller;
  chargeType: ChargeType;
  fixedValue?: string | null; // ngwee
  percentValue?: string | null; // e.g. "2.50"
  ovaAccountRef?: string | null;
}

// Account management for the admin Configurations screen (§6.1.2): operating
// mode, charge config per processor, and webhook/IP settings.
@Injectable()
export class AccountConfigService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly audit: AuditService,
  ) {}

  async getAccountConfig(accountId: string): Promise<unknown> {
    const account = await this.pool.query(
      `SELECT id, account_number, merchant_id, account_type, operating_mode, status,
              float_balance::text AS float_balance, low_float_threshold::text AS low_float_threshold
         FROM accounts WHERE id = $1`,
      [accountId],
    );
    if (account.rowCount === 0) throw new NotFoundError(`account not found: ${accountId}`);

    const settings = await this.pool.query(
      `SELECT callback_url, COALESCE(ip_whitelist, '{}') AS ip_whitelist
         FROM account_settings WHERE account_id = $1`,
      [accountId],
    );
    const chargeConfigs = await this.pool.query(
      `SELECT processor, charge_fulfiller, charge_type,
              fixed_value::text AS fixed_value, percent_value::text AS percent_value, ova_account_ref
         FROM charge_configs WHERE account_id = $1 ORDER BY processor`,
      [accountId],
    );

    return {
      account: account.rows[0],
      settings: settings.rowCount === 0 ? { callback_url: null, ip_whitelist: [] } : settings.rows[0],
      chargeConfigs: chargeConfigs.rows,
    };
  }

  async upsertChargeConfig(
    accountId: string,
    input: ChargeConfigInput,
    actorId: string,
  ): Promise<{ accountId: string; processor: string }> {
    await this.assertAccount(accountId);
    await this.pool.query(
      `INSERT INTO charge_configs
         (account_id, processor, charge_fulfiller, charge_type, fixed_value, percent_value, ova_account_ref)
       VALUES ($1, $2, $3, $4, $5::bigint, $6::numeric, $7)
       ON CONFLICT (account_id, processor) DO UPDATE SET
         charge_fulfiller = EXCLUDED.charge_fulfiller,
         charge_type      = EXCLUDED.charge_type,
         fixed_value      = EXCLUDED.fixed_value,
         percent_value    = EXCLUDED.percent_value,
         ova_account_ref  = EXCLUDED.ova_account_ref,
         updated_at       = now()`,
      [
        accountId,
        input.processor,
        input.chargeFulfiller,
        input.chargeType,
        input.fixedValue ?? null,
        input.percentValue ?? null,
        input.ovaAccountRef ?? null,
      ],
    );
    await this.auditWrite(actorId, 'CHARGE_CONFIG_UPDATED', accountId, {
      processor: input.processor,
      chargeType: input.chargeType,
      chargeFulfiller: input.chargeFulfiller,
    });
    return { accountId, processor: input.processor };
  }

  async updateSettings(
    accountId: string,
    input: { callbackUrl?: string | null; ipWhitelist?: string[] | null },
    actorId: string,
  ): Promise<{ accountId: string }> {
    await this.assertAccount(accountId);
    await this.pool.query(
      `INSERT INTO account_settings (account_id, callback_url, ip_whitelist)
       VALUES ($1, $2, COALESCE($3::text[], '{}'::text[]))
       ON CONFLICT (account_id) DO UPDATE SET
         callback_url = COALESCE(EXCLUDED.callback_url, account_settings.callback_url),
         ip_whitelist = COALESCE($3::text[], account_settings.ip_whitelist)`,
      [accountId, input.callbackUrl ?? null, input.ipWhitelist ?? null],
    );
    await this.auditWrite(actorId, 'ACCOUNT_SETTINGS_UPDATED', accountId, {
      callbackUrl: input.callbackUrl ?? null,
    });
    return { accountId };
  }

  async setMode(
    accountId: string,
    mode: OperatingMode,
    actorId: string,
  ): Promise<{ accountId: string; operatingMode: OperatingMode }> {
    const current = await this.pool.query<{ operating_mode: string }>(
      'SELECT operating_mode FROM accounts WHERE id = $1',
      [accountId],
    );
    if (current.rowCount === 0) throw new NotFoundError(`account not found: ${accountId}`);
    await this.pool.query('UPDATE accounts SET operating_mode = $1 WHERE id = $2', [mode, accountId]);
    await this.auditWrite(actorId, 'MODE_CHANGED', accountId, {
      from: current.rows[0].operating_mode,
      to: mode,
    });
    return { accountId, operatingMode: mode };
  }

  private async assertAccount(accountId: string): Promise<void> {
    const res = await this.pool.query('SELECT 1 FROM accounts WHERE id = $1', [accountId]);
    if (res.rowCount === 0) throw new NotFoundError(`account not found: ${accountId}`);
  }

  private async auditWrite(
    actorId: string,
    action: string,
    target: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await this.audit.write(client, { actorId, actorScope: 'SYSTEM', action, target, metadata });
    } finally {
      client.release();
    }
  }
}

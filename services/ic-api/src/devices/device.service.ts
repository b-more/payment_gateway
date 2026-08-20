import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { withTransaction } from '../database/tx';
import { AuditService } from '../audit/audit.service';
import { CredentialService } from '../credentials/credential.service';
import { hashSecret, verifySecret } from '../credentials/crypto';
import { ConflictError, NotFoundError, ValidationError } from '../money/errors';

const ACTIVATION_TTL_HOURS = 72;
// Crockford base32 minus ambiguous chars (I, L, O, U) — friendly to type once.
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export interface CreatedDevice {
  deviceId: string;
  label: string;
  activationCode: string; // shown ONCE
  activationExpiresAt: string;
}

export interface ActivatedDevice {
  deviceId: string;
  apiKey: string;
  secret: string; // shown ONCE
  signingKey: string; // shown ONCE
  accountNumber: string;
  merchantName: string;
  branch: string;
  environment: 'SANDBOX' | 'LIVE';
  // Merchant profile — printed on receipts (name, address, TPIN, etc.).
  tradingName: string;
  address: string;
  city: string;
  tpin: string;
  merchantPhone: string;
  registrationNumber: string;
}

export interface DeviceSummary {
  id: string;
  account_id: string;
  account_number: string;
  label: string;
  serial_number: string | null;
  environment: 'SANDBOX' | 'LIVE';
  status: string;
  last_seen_at: string | null;
  activated_at: string | null;
  created_at: string;
}

function randomCode(len: number): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/**
 * Per-terminal device registration (0027). A device is registered PENDING with a
 * one-time activation code; on activation it is issued its own api_credentials
 * row (scoped by device_id), reusing CredentialService.generate. Revoking a
 * device revokes that credential, which the ApiAuthGuard already honours.
 */
@Injectable()
export class DeviceService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly credentials: CredentialService,
    private readonly audit: AuditService,
  ) {}

  /** Register a terminal under a COLLECTION account; returns the activation code once. */
  async createDevice(input: { merchantId: string; accountId: string; label: string; actorId?: string | null }): Promise<CreatedDevice> {
    const account = await this.pool.query<{ account_type: string; operating_mode: string }>(
      'SELECT account_type, operating_mode FROM accounts WHERE id = $1 AND merchant_id = $2',
      [input.accountId, input.merchantId],
    );
    if (account.rowCount === 0) throw new NotFoundError('account not found for this merchant');
    if (account.rows[0].account_type !== 'COLLECTION') {
      throw new ValidationError('a terminal can only be registered under a COLLECTION account');
    }
    const environment: 'SANDBOX' | 'LIVE' = account.rows[0].operating_mode === 'PRODUCTION' ? 'LIVE' : 'SANDBOX';

    const ref = randomCode(8);
    const secret = randomCode(10);
    const code = `${ref}-${secret}`; // ref is the single-row lookup key; the whole code is hashed
    const codeHash = await hashSecret(code);
    const expiresAt = new Date(Date.now() + ACTIVATION_TTL_HOURS * 3600_000);

    let inserted;
    try {
      inserted = await this.pool.query<{ id: string }>(
        `INSERT INTO devices
           (account_id, merchant_id, label, environment, status, activation_ref, activation_code_hash, activation_expires_at)
         VALUES ($1, $2, $3, $4::credential_environment, 'PENDING', $5, $6, $7)
         RETURNING id`,
        [input.accountId, input.merchantId, input.label, environment, ref, codeHash, expiresAt.toISOString()],
      );
    } catch (e) {
      // uq_devices_account_label
      if (typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505') {
        throw new ConflictError(`a terminal labelled "${input.label}" already exists on this account`);
      }
      throw e;
    }

    const deviceId = inserted.rows[0].id;
    await withTransaction(this.pool, async (client) => {
      await this.audit.write(client, {
        actorId: input.actorId ?? null,
        actorScope: 'MERCHANT',
        action: 'DEVICE_REGISTERED',
        target: deviceId,
        metadata: { accountId: input.accountId, label: input.label, environment },
      });
    });

    return { deviceId, label: input.label, activationCode: code, activationExpiresAt: expiresAt.toISOString() };
  }

  /** Consume an activation code and issue the device its own credential (once). */
  async activate(input: { activationCode: string; serialNumber?: string | null }): Promise<ActivatedDevice> {
    const code = input.activationCode.trim().toUpperCase(); // codes are uppercase base32
    const ref = code.split('-')[0];
    if (!ref) throw new ValidationError('invalid activation code');

    const found = await this.pool.query<{
      id: string;
      account_id: string;
      label: string;
      environment: 'SANDBOX' | 'LIVE';
      status: string;
      activation_code_hash: string | null;
      activation_expires_at: Date | null;
    }>(
      `SELECT id, account_id, label, environment, status, activation_code_hash, activation_expires_at
         FROM devices WHERE activation_ref = $1`,
      [ref],
    );
    // Generic failure: never reveal whether the ref existed.
    const invalid = new ValidationError('activation code is invalid, expired, or already used');
    if (found.rowCount === 0) throw invalid;
    const device = found.rows[0];
    if (device.status !== 'PENDING' || device.activation_code_hash === null) throw invalid;
    if (device.activation_expires_at && device.activation_expires_at.getTime() < Date.now()) throw invalid;
    if (!(await verifySecret(code, device.activation_code_hash))) throw invalid;

    const account = await this.pool.query<{
      account_number: string; merchant_name: string; trading_name: string | null;
      address: string | null; city: string | null; tpin: string | null;
      merchant_phone: string | null; registration_number: string | null;
    }>(
      `SELECT a.account_number, m.name AS merchant_name, m.trading_name,
              m.address, m.city, m.tpin, m.phone AS merchant_phone, m.registration_number
         FROM accounts a JOIN merchants m ON m.id = a.merchant_id WHERE a.id = $1`,
      [device.account_id],
    );
    const r = account.rows[0];
    const accountNumber = r?.account_number ?? '';
    const merchantName = r?.merchant_name ?? '';

    return withTransaction(this.pool, async (client) => {
      const cred = await this.credentials.generate({ accountId: device.account_id, environment: device.environment }, client);
      await client.query('UPDATE api_credentials SET device_id = $1 WHERE id = $2', [device.id, cred.id]);
      const updated = await client.query(
        `UPDATE devices
            SET status = 'ACTIVE', credential_id = $2, activated_at = now(), serial_number = $3,
                activation_code_hash = NULL, activation_ref = NULL, last_seen_at = now()
          WHERE id = $1 AND status = 'PENDING'`,
        [device.id, cred.id, input.serialNumber ?? null],
      );
      if (updated.rowCount === 0) throw invalid; // lost a race — already activated
      await this.audit.write(client, {
        actorId: null,
        actorScope: 'SYSTEM',
        action: 'DEVICE_ACTIVATED',
        target: device.id,
        metadata: { accountId: device.account_id, credentialId: cred.id, environment: device.environment },
      });
      return {
        deviceId: device.id,
        apiKey: cred.apiKey,
        secret: cred.secret,
        signingKey: cred.signingKey,
        accountNumber,
        merchantName,
        branch: device.label,
        environment: device.environment,
        tradingName: r?.trading_name ?? '',
        address: r?.address ?? '',
        city: r?.city ?? '',
        tpin: r?.tpin ?? '',
        merchantPhone: r?.merchant_phone ?? '',
        registrationNumber: r?.registration_number ?? '',
      };
    });
  }

  /** Revoke a device and its credential; the guard rejects revoked credentials. */
  async revokeDevice(input: { deviceId: string; merchantId?: string; actorId?: string | null }): Promise<void> {
    const where = input.merchantId ? 'id = $1 AND merchant_id = $2' : 'id = $1';
    const params = input.merchantId ? [input.deviceId, input.merchantId] : [input.deviceId];
    const res = await this.pool.query(
      `UPDATE devices SET status = 'REVOKED', revoked_at = now() WHERE ${where} AND status <> 'REVOKED' RETURNING id`,
      params,
    );
    if (res.rowCount === 0) throw new NotFoundError('device not found or already revoked');
    await withTransaction(this.pool, async (client) => {
      await client.query("UPDATE api_credentials SET status = 'REVOKED' WHERE device_id = $1", [input.deviceId]);
      await this.audit.write(client, {
        actorId: input.actorId ?? null,
        actorScope: input.merchantId ? 'MERCHANT' : 'SYSTEM',
        action: 'DEVICE_REVOKED',
        target: input.deviceId,
        metadata: {},
      });
    });
  }

  /** List a merchant's devices (portal). */
  async listDevices(merchantId: string): Promise<DeviceSummary[]> {
    const res = await this.pool.query<{
      id: string; account_id: string; account_number: string; label: string; serial_number: string | null;
      environment: 'SANDBOX' | 'LIVE'; status: string; last_seen_at: Date | null; activated_at: Date | null; created_at: Date;
    }>(
      `SELECT d.id, d.account_id, a.account_number, d.label, d.serial_number, d.environment, d.status,
              d.last_seen_at, d.activated_at, d.created_at
         FROM devices d JOIN accounts a ON a.id = d.account_id
        WHERE d.merchant_id = $1
        ORDER BY d.created_at DESC LIMIT 200`,
      [merchantId],
    );
    return res.rows.map((r) => ({
      id: r.id,
      account_id: r.account_id,
      account_number: r.account_number,
      label: r.label,
      serial_number: r.serial_number,
      environment: r.environment,
      status: r.status,
      last_seen_at: r.last_seen_at ? r.last_seen_at.toISOString() : null,
      activated_at: r.activated_at ? r.activated_at.toISOString() : null,
      created_at: r.created_at.toISOString(),
    }));
  }

  /** Best-effort last-seen touch, called when a device credential transacts. */
  async touchLastSeen(deviceId: string): Promise<void> {
    await this.pool.query('UPDATE devices SET last_seen_at = now() WHERE id = $1', [deviceId]);
  }
}

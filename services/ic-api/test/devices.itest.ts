import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool } from '../src/database/database.module';
import { AuditService } from '../src/audit/audit.service';
import { CredentialService } from '../src/credentials/credential.service';
import { DeviceService } from '../src/devices/device.service';

// Real DB, no network. Exercises the full device-registration backend:
// register -> activate (mints a device-scoped credential) -> authenticate ->
// device-scoped list -> revoke.

const pool = createPool(process.env.DATABASE_URL);
const audit = new AuditService();
const credentials = new CredentialService(pool);
const devices = new DeviceService(pool, credentials, audit);

async function seedMerchantAccount(mode: 'SANDBOX' | 'PRODUCTION' = 'SANDBOX', type = 'COLLECTION'): Promise<{ merchantId: string; accountId: string; accountNumber: string }> {
  const tag = randomUUID().slice(0, 8);
  const m = await pool.query("INSERT INTO merchants (name,merchant_type,email,status) VALUES ('POS','PRIVATE',$1,'APPROVED') RETURNING id", [`pos-${tag}@x.zm`]);
  const a = await pool.query(
    'INSERT INTO accounts (merchant_id,account_type,operating_mode) VALUES ($1,$2::account_type,$3::operating_mode) RETURNING id, account_number',
    [m.rows[0].id, type, mode],
  );
  return { merchantId: m.rows[0].id, accountId: a.rows[0].id, accountNumber: a.rows[0].account_number };
}

after(async () => { await pool.end(); });

describe('device registration', { concurrency: 1 }, () => {
  test('register -> activate issues a device-scoped credential; auth carries deviceId', async () => {
    const { merchantId, accountId, accountNumber } = await seedMerchantAccount();
    const created = await devices.createDevice({ merchantId, accountId, label: 'Till A' });
    assert.match(created.activationCode, /^[0-9A-Z]{8}-[0-9A-Z]{10}$/);

    const activated = await devices.activate({ activationCode: created.activationCode, serialNumber: 'Z100-SN-1' });
    assert.equal(activated.deviceId, created.deviceId);
    assert.equal(activated.accountNumber, accountNumber);
    assert.equal(activated.environment, 'SANDBOX');
    assert.match(activated.apiKey, /^ic_sand_/);
    assert.match(activated.secret, /^sk_/);

    // Device row is ACTIVE, linked to the credential, code fields cleared.
    const d = (await pool.query('SELECT status, credential_id, serial_number, activation_ref, activation_code_hash FROM devices WHERE id=$1', [created.deviceId])).rows[0];
    assert.equal(d.status, 'ACTIVE');
    assert.equal(d.serial_number, 'Z100-SN-1');
    assert.equal(d.activation_ref, null);
    assert.equal(d.activation_code_hash, null);

    // The credential is scoped to the device and the account.
    const c = (await pool.query('SELECT account_id, device_id, status, environment FROM api_credentials WHERE id=$1', [d.credential_id])).rows[0];
    assert.equal(c.device_id, created.deviceId);
    assert.equal(c.account_id, accountId);
    assert.equal(c.status, 'ACTIVE');

    // Authenticating with the device secret carries the deviceId through.
    const ctx = await credentials.authenticateWithSecret({ apiKey: activated.apiKey, secret: activated.secret, clientIp: null });
    assert.equal(ctx.accountId, accountId);
    assert.equal(ctx.deviceId, created.deviceId);
    assert.equal(ctx.environment, 'SANDBOX');
  });

  test('activation is single-use', async () => {
    const { merchantId, accountId } = await seedMerchantAccount();
    const created = await devices.createDevice({ merchantId, accountId, label: 'Till B' });
    await devices.activate({ activationCode: created.activationCode });
    await assert.rejects(devices.activate({ activationCode: created.activationCode }), /invalid, expired, or already used/);
  });

  test('a wrong code is rejected', async () => {
    await assert.rejects(devices.activate({ activationCode: 'NOPE1234-BADSECRET0' }), /invalid, expired, or already used/);
  });

  test('revoke kills the device credential', async () => {
    const { merchantId, accountId } = await seedMerchantAccount();
    const created = await devices.createDevice({ merchantId, accountId, label: 'Till C' });
    const activated = await devices.activate({ activationCode: created.activationCode });

    await devices.revokeDevice({ deviceId: created.deviceId, merchantId });
    const d = (await pool.query('SELECT status FROM devices WHERE id=$1', [created.deviceId])).rows[0];
    assert.equal(d.status, 'REVOKED');
    const c = (await pool.query('SELECT status FROM api_credentials WHERE device_id=$1', [created.deviceId])).rows[0];
    assert.equal(c.status, 'REVOKED');

    // A revoked credential no longer authenticates.
    await assert.rejects(credentials.authenticateWithSecret({ apiKey: activated.apiKey, secret: activated.secret, clientIp: null }));
  });

  test('list is device-scoped for a terminal credential', async () => {
    const { merchantId, accountId } = await seedMerchantAccount();
    const created = await devices.createDevice({ merchantId, accountId, label: 'Till D' });
    await devices.activate({ activationCode: created.activationCode });

    // One txn from this device, one from the account with no device.
    const insert = (deviceId: string | null): Promise<unknown> => pool.query(
      `INSERT INTO transactions (account_id,type,processor,msisdn,amount,charge,net_amount,total_amount,status,idempotency_key,environment,device_id)
       VALUES ($1,'COLLECTION','MTN','260970000001',1000,0,1000,1000,'SUCCESS',$2,'SANDBOX',$3)`,
      [accountId, randomUUID(), deviceId],
    );
    await insert(created.deviceId);
    await insert(null);

    const { ApiReadService } = await import('../src/api/read.service');
    const read = new ApiReadService(pool);
    const deviceScoped = await read.listTransactions({ accountId, deviceId: created.deviceId, limit: undefined, cursor: undefined, status: undefined });
    assert.equal(deviceScoped.items.length, 1, 'device credential sees only its own txns');
    const accountScoped = await read.listTransactions({ accountId, deviceId: null, limit: undefined, cursor: undefined, status: undefined });
    assert.equal(accountScoped.items.length, 2, 'account-wide credential sees all');
  });

  test('a terminal can only be registered under a COLLECTION account', async () => {
    const { merchantId, accountId } = await seedMerchantAccount('SANDBOX', 'DISBURSEMENT');
    await assert.rejects(devices.createDevice({ merchantId, accountId, label: 'Bad' }), /COLLECTION/);
  });

  test('duplicate label on one account is rejected', async () => {
    const { merchantId, accountId } = await seedMerchantAccount();
    await devices.createDevice({ merchantId, accountId, label: 'Dup' });
    await assert.rejects(devices.createDevice({ merchantId, accountId, label: 'Dup' }), /already exists/);
  });
});

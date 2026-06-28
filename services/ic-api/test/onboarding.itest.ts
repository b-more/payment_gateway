import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.API_SIGNING_ENC_KEY = Buffer.alloc(32, 9).toString('base64');

import { createPool } from '../src/database/database.module';
import { AuditService } from '../src/audit/audit.service';
import { CredentialService } from '../src/credentials/credential.service';
import { EmailService } from '../src/email/email.service';
import { createEmailTransport } from '../src/email/transport';
import { OnboardingService } from '../src/onboarding/onboarding.service';
import { AccountProvisioningService } from '../src/onboarding/account-provisioning.service';
import { canonicalRequest, signRequest } from '../src/credentials/crypto';
import { ConflictError } from '../src/money/errors';

const pool = createPool(process.env.DATABASE_URL);
const audit = new AuditService();
const credentials = new CredentialService(pool);
const onboarding = new OnboardingService(pool, audit);
const provisioning = new AccountProvisioningService(pool, credentials, audit, new EmailService(createEmailTransport()));

after(async () => {
  await pool.end();
});

function uniqueEmail(): string {
  return `m-${randomUUID()}@x.zm`;
}

async function apply(): Promise<string> {
  const { merchantId } = await onboarding.submitApplication({
    merchant: { name: 'Acme', merchantType: 'PRIVATE', email: uniqueEmail() },
    admin: { name: 'Jane', email: uniqueEmail() },
  });
  return merchantId;
}

test('ONB-1: application creates PENDING merchant + INVITED admin user with MERCHANT_ADMIN', async () => {
  const merchantId = await apply();
  const m = await pool.query<{ status: string }>('SELECT status FROM merchants WHERE id = $1', [merchantId]);
  assert.equal(m.rows[0].status, 'PENDING');

  const u = await pool.query<{ scope: string; status: string }>(
    'SELECT scope, status FROM users WHERE merchant_id = $1',
    [merchantId],
  );
  assert.equal(u.rows[0].scope, 'MERCHANT');
  assert.equal(u.rows[0].status, 'INVITED');

  const r = await pool.query<{ name: string }>(
    `SELECT r.name FROM user_roles ur
       JOIN users u ON u.id = ur.user_id
       JOIN roles r ON r.id = ur.role_id
     WHERE u.merchant_id = $1`,
    [merchantId],
  );
  assert.equal(r.rows[0].name, 'MERCHANT_ADMIN');
});

test('ONB-4: provisioning a non-approved merchant is rejected', async () => {
  const merchantId = await apply();
  await assert.rejects(
    provisioning.provisionAccount({ merchantId, accountType: 'COLLECTION', actorId: randomUUID() }),
    ConflictError,
  );
});

test('ONB-3: approval flips status to APPROVED and is audit-logged', async () => {
  const merchantId = await apply();
  await onboarding.reviewApplication({ merchantId, decision: 'APPROVED', actorId: randomUUID() });
  const m = await pool.query<{ status: string }>('SELECT status FROM merchants WHERE id = $1', [merchantId]);
  assert.equal(m.rows[0].status, 'APPROVED');
  const a = await pool.query(
    "SELECT 1 FROM audit_logs WHERE action = 'MERCHANT_APPROVED' AND target = $1",
    [merchantId],
  );
  assert.equal(a.rowCount, 1);
});

test('ONB-4/5/6: provisioning issues SANDBOX+LIVE creds, zero-float SANDBOX account, webhook secret', async () => {
  const merchantId = await apply();
  await onboarding.reviewApplication({ merchantId, decision: 'APPROVED', actorId: randomUUID() });
  const result = await provisioning.provisionAccount({
    merchantId,
    accountType: 'COLLECTION',
    actorId: randomUUID(),
  });
  const { accountId, credentials: creds } = result;

  // ONB-6 / NN-10
  const acc = await pool.query<{ operating_mode: string; float_balance: string }>(
    'SELECT operating_mode, float_balance FROM accounts WHERE id = $1',
    [accountId],
  );
  assert.equal(acc.rows[0].operating_mode, 'SANDBOX');
  assert.equal(acc.rows[0].float_balance, '0');

  // webhook signing secret set (closes the §5.7 gap)
  const settings = await pool.query<{ webhook_signing_secret: string | null }>(
    'SELECT webhook_signing_secret FROM account_settings WHERE account_id = $1',
    [accountId],
  );
  assert.ok(settings.rows[0].webhook_signing_secret);

  // two credentials, secret hashed only, signing key encrypted (NN-7)
  const stored = await pool.query<{ environment: string; secret_hash: string; signing_key_ciphertext: string }>(
    'SELECT environment, secret_hash, signing_key_ciphertext FROM api_credentials WHERE account_id = $1 ORDER BY environment',
    [accountId],
  );
  assert.equal(stored.rowCount, 2);
  assert.deepEqual(stored.rows.map((r) => r.environment).sort(), ['LIVE', 'SANDBOX']);
  for (const row of stored.rows) {
    assert.match(row.secret_hash, /^\$argon2id\$/); // argon2id hashed, not plaintext
    assert.ok(row.signing_key_ciphertext.length > 0);
  }
  assert.notEqual(creds.sandbox.secret, creds.live.secret);

  const audits = await pool.query(
    "SELECT 1 FROM audit_logs WHERE action = 'CREDENTIAL_GENERATED' AND metadata->>'accountId' = $1",
    [accountId],
  );
  assert.equal(audits.rowCount, 2);
});

test('ONB-4: a freshly-issued credential authenticates a signed /v1 request', async () => {
  const merchantId = await apply();
  await onboarding.reviewApplication({ merchantId, decision: 'APPROVED', actorId: randomUUID() });
  const { accountId, credentials: creds } = await provisioning.provisionAccount({
    merchantId,
    accountType: 'COLLECTION',
    actorId: randomUUID(),
  });

  const ts = Math.floor(Date.now() / 1000).toString();
  const method = 'POST';
  const path = '/v1/collections';
  const rawBody = '{}';
  const signature = signRequest(
    creds.sandbox.signingKey,
    canonicalRequest({ timestamp: ts, method, path, rawBody }),
  );
  const ctx = await credentials.authenticate({
    apiKey: creds.sandbox.apiKey,
    timestamp: ts,
    signature,
    method,
    path,
    rawBody,
    clientIp: '127.0.0.1',
  });
  assert.equal(ctx.accountId, accountId);
  assert.equal(ctx.environment, 'SANDBOX');
});

test('ONB-8: promotion sets PRODUCTION and is audit-logged', async () => {
  const merchantId = await apply();
  await onboarding.reviewApplication({ merchantId, decision: 'APPROVED', actorId: randomUUID() });
  const { accountId } = await provisioning.provisionAccount({
    merchantId,
    accountType: 'COLLECTION',
    actorId: randomUUID(),
  });
  await provisioning.promoteAccount({ accountId, actorId: randomUUID() });

  const acc = await pool.query<{ operating_mode: string }>(
    'SELECT operating_mode FROM accounts WHERE id = $1',
    [accountId],
  );
  assert.equal(acc.rows[0].operating_mode, 'PRODUCTION');
  const a = await pool.query(
    "SELECT 1 FROM audit_logs WHERE action = 'MODE_CHANGED' AND target = $1",
    [accountId],
  );
  assert.equal(a.rowCount, 1);
});

test('ONB-1: duplicate admin email is rejected', async () => {
  const email = uniqueEmail();
  await onboarding.submitApplication({
    merchant: { name: 'A', merchantType: 'PRIVATE', email: uniqueEmail() },
    admin: { name: 'Dup', email },
  });
  await assert.rejects(
    onboarding.submitApplication({
      merchant: { name: 'B', merchantType: 'PUBLIC', email: uniqueEmail() },
      admin: { name: 'Dup', email },
    }),
    ConflictError,
  );
});

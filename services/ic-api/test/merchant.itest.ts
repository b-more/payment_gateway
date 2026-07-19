import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';

process.env.API_SIGNING_ENC_KEY = Buffer.alloc(32, 3).toString('base64');
process.env.JWT_ACCESS_SECRET = 'test-merchant-secret';
process.env.AUTH_EXPOSE_OTP = 'true';
process.env.DUAL_CONTROL_THRESHOLD = '1000000000';
process.env.API_RATE_MAX = '100000';
process.env.WEBHOOK_WORKER = 'off';

import { AppModule } from '../src/app.module';
import { ApiErrorFilter } from '../src/api/api-error.filter';
import { createPool } from '../src/database/database.module';
import { AuthService } from '../src/auth/auth.service';

const PORT = 8096;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'merchant-pass-1';
const pool = createPool(process.env.DATABASE_URL);

let app: INestApplication;
let auth: AuthService;

interface Res {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  cookies: string[];
}

async function req(method: string, path: string, opts: { body?: object; cookie?: string } = {}): Promise<Res> {
  const headers: Record<string, string> = {};
  if (opts.body) headers['content-type'] = 'application/json';
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})), cookies: res.headers.getSetCookie() };
}

const cookieHeader = (set: string[]): string => set.map((c) => c.split(';')[0]).join('; ');

interface Merchant {
  merchantId: string;
  accountId: string;
  email: string;
  txnId: string;
}

async function seedMerchant(roles: string[]): Promise<Merchant> {
  const email = `mu-${randomUUID()}@x.zm`;
  const m = await pool.query<{ id: string }>(
    "INSERT INTO merchants (name, merchant_type, email, status) VALUES ('M','PRIVATE',$1,'APPROVED') RETURNING id",
    [email],
  );
  const merchantId = m.rows[0].id;
  const a = await pool.query<{ id: string }>(
    "INSERT INTO accounts (merchant_id, account_type) VALUES ($1,'COLLECTION') RETURNING id",
    [merchantId],
  );
  const accountId = a.rows[0].id;
  await pool.query(
    'INSERT INTO account_settings (account_id, webhook_signing_secret) VALUES ($1,$2)',
    [accountId, 'whsec_x'],
  );
  const t = await pool.query<{ id: string }>(
    `INSERT INTO transactions (account_id, type, processor, msisdn, amount, charge, net_amount, total_amount, status, idempotency_key, environment)
     VALUES ($1,'COLLECTION','MTN','260970000001',100000,500,100000,100500,'SUCCESS',$2,'SANDBOX') RETURNING id`,
    [accountId, randomUUID()],
  );
  const u = await pool.query<{ id: string }>(
    "INSERT INTO users (scope, merchant_id, name, email, status) VALUES ('MERCHANT',$1,'U',$2,'INVITED') RETURNING id",
    [merchantId, email],
  );
  for (const role of roles) {
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [u.rows[0].id, role]);
  }
  await auth.setPassword(u.rows[0].id, PASSWORD);
  return { merchantId, accountId, email, txnId: t.rows[0].id };
}

async function loginMerchant(email: string): Promise<string> {
  const login = await req('POST', '/v1/auth/merchant/login', { body: { email, password: PASSWORD } });
  const verify = await req('POST', '/v1/auth/merchant/verify-otp', {
    body: { challengeId: login.body.challengeId, code: login.body.devCode },
  });
  assert.equal(verify.status, 200);
  return cookieHeader(verify.cookies);
}

before(async () => {
  app = await NestFactory.create(AppModule, { rawBody: true, logger: false });
  app.setGlobalPrefix('v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'onboarding/applications', method: RequestMethod.POST },
    ],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new ApiErrorFilter());
  await app.listen(PORT, '127.0.0.1');
  auth = app.get(AuthService, { strict: false });
});

after(async () => {
  await app.close();
  await pool.end();
});

test('NN-6: a merchant sees only its own transactions and accounts', async () => {
  const a = await seedMerchant(['MERCHANT_ADMIN']);
  const b = await seedMerchant(['MERCHANT_ADMIN']);
  const cookie = await loginMerchant(a.email);

  const txns = (await req('GET', '/v1/merchant/transactions', { cookie })).body as Array<{ id: string }>;
  assert.ok(txns.every((t) => t.id !== b.txnId), 'must not see another merchant transactions');
  assert.ok(txns.some((t) => t.id === a.txnId));

  const accounts = (await req('GET', '/v1/merchant/accounts', { cookie })).body as Array<{ id: string }>;
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].id, a.accountId);
});

test('SEC-Z2: cross-merchant settings/regenerate are 404', async () => {
  const a = await seedMerchant(['MERCHANT_ADMIN']);
  const b = await seedMerchant(['MERCHANT_ADMIN']);
  const cookie = await loginMerchant(a.email);

  const otherSettings = await req('PUT', `/v1/merchant/accounts/${b.accountId}/settings`, {
    cookie,
    body: { callbackUrl: 'https://evil.example/hook' },
  });
  assert.equal(otherSettings.status, 404);

  const otherRegen = await req('POST', `/v1/merchant/accounts/${b.accountId}/credentials/SANDBOX/regenerate`, {
    cookie,
  });
  assert.equal(otherRegen.status, 404);
});

test('§6.2.7: manage own settings and regenerate own keys', async () => {
  const a = await seedMerchant(['MERCHANT_ADMIN']);
  const cookie = await loginMerchant(a.email);

  const upd = await req('PUT', `/v1/merchant/accounts/${a.accountId}/settings`, {
    cookie,
    body: { callbackUrl: 'https://mine.example/hook', ipWhitelist: ['41.1.2.3'] },
  });
  assert.equal(upd.status, 200);

  const regen = await req('POST', `/v1/merchant/accounts/${a.accountId}/credentials/SANDBOX/regenerate`, { cookie });
  assert.equal(regen.status, 201);
  assert.match(String(regen.body.apiKey), /^ic_sand_/);
  assert.ok(regen.body.secret && regen.body.signingKey);
});

test('credentials endpoint never leaks secrets', async () => {
  const a = await seedMerchant(['MERCHANT_ADMIN']);
  const cookie = await loginMerchant(a.email);
  await req('POST', `/v1/merchant/accounts/${a.accountId}/credentials/SANDBOX/regenerate`, { cookie });

  const creds = (await req('GET', '/v1/merchant/credentials', { cookie })).body as Array<Record<string, unknown>>;
  assert.ok(creds.length >= 1);
  for (const c of creds) {
    assert.ok('api_key' in c);
    assert.ok(!('secret_hash' in c) && !('signing_key_ciphertext' in c), 'must not expose secrets');
  }
});

test('§6.2.5: merchant reports are scoped; cannot export another merchant’s report', async () => {
  const a = await seedMerchant(['MERCHANT_ADMIN']);
  const b = await seedMerchant(['MERCHANT_ADMIN']);
  const cookieA = await loginMerchant(a.email);

  const created = await req('POST', '/v1/merchant/reports', {
    cookie: cookieA,
    body: { name: 'Mine', reportType: 'TRANSACTIONS', from: '2020-01-01', to: '2100-01-01' },
  });
  assert.equal(created.status, 201);
  const reportId = String(created.body.id);

  // A's own report lists + exports.
  const list = (await req('GET', '/v1/merchant/reports', { cookie: cookieA })).body as Array<{ id: string }>;
  assert.ok(list.some((r) => r.id === reportId));
  const dl = await fetch(`${BASE}/v1/merchant/reports/${reportId}/export`, { headers: { cookie: cookieA } });
  assert.equal(dl.status, 200);
  const csv = await dl.text();
  // Scoped: only A's transaction appears, never B's.
  assert.ok(csv.includes(a.txnId));
  assert.ok(!csv.includes(b.txnId));

  // B cannot export A's report (cross-merchant -> 404).
  const cookieB = await loginMerchant(b.email);
  const denied = await fetch(`${BASE}/v1/merchant/reports/${reportId}/export`, { headers: { cookie: cookieB } });
  assert.equal(denied.status, 404);
});

test('role + realm gates: no-role merchant cannot regenerate; admin token rejected', async () => {
  const noRole = await seedMerchant([]); // merchant user without MERCHANT_ADMIN
  const cookie = await loginMerchant(noRole.email);
  const regen = await req('POST', `/v1/merchant/accounts/${noRole.accountId}/credentials/SANDBOX/regenerate`, { cookie });
  assert.equal(regen.status, 403);

  // A SYSTEM (admin) session cannot use merchant endpoints (SEC-A4 scope).
  const adminEmail = `sys-${randomUUID()}@x.zm`;
  const su = await pool.query<{ id: string }>(
    "INSERT INTO users (scope, name, email, status) VALUES ('SYSTEM','A',$1,'INVITED') RETURNING id",
    [adminEmail],
  );
  await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [su.rows[0].id, 'ADMIN']);
  await auth.setPassword(su.rows[0].id, PASSWORD);
  const adminLogin = await req('POST', '/v1/auth/admin/login', { body: { email: adminEmail, password: PASSWORD } });
  const adminVerify = await req('POST', '/v1/auth/admin/verify-otp', {
    body: { challengeId: adminLogin.body.challengeId, code: adminLogin.body.devCode },
  });
  const denied = await req('GET', '/v1/merchant/dashboard', { cookie: cookieHeader(adminVerify.cookies) });
  assert.equal(denied.status, 403);
});

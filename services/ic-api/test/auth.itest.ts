import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';

process.env.API_SIGNING_ENC_KEY = Buffer.alloc(32, 5).toString('base64');
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.AUTH_EXPOSE_OTP = 'true';
process.env.AUTH_MAX_FAILED = '5';
process.env.DUAL_CONTROL_THRESHOLD = '1000000000';
process.env.API_RATE_MAX = '100000';
process.env.WEBHOOK_WORKER = 'off';

import { AppModule } from '../src/app.module';
import { ApiErrorFilter } from '../src/api/api-error.filter';
import { createPool } from '../src/database/database.module';
import { AuthService } from '../src/auth/auth.service';

const PORT = 8097;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'correct horse battery staple';
const pool = createPool(process.env.DATABASE_URL);

let app: INestApplication;
let auth: AuthService;

interface JsonRes {
  status: number;
  body: Record<string, unknown> & { error?: { code: string }; devCode?: string; challengeId?: string };
  cookies: string[];
}

async function req(
  method: string,
  path: string,
  opts: { body?: object; cookie?: string } = {},
): Promise<JsonRes> {
  const headers: Record<string, string> = {};
  if (opts.body) headers['content-type'] = 'application/json';
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  return {
    status: res.status,
    body: (await res.json().catch(() => ({}))) as JsonRes['body'],
    cookies: res.headers.getSetCookie(),
  };
}

function cookieHeader(setCookies: string[]): string {
  return setCookies.map((c) => c.split(';')[0]).join('; ');
}

async function createSystemUser(roles: string[]): Promise<string> {
  const email = `sys-${randomUUID()}@x.zm`;
  const u = await pool.query<{ id: string }>(
    "INSERT INTO users (scope, name, email, status) VALUES ('SYSTEM','U',$1,'INVITED') RETURNING id",
    [email],
  );
  const userId = u.rows[0].id;
  for (const role of roles) {
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [userId, role]);
  }
  await auth.setPassword(userId, PASSWORD);
  return email;
}

async function authenticate(realm: string, email: string): Promise<string> {
  const login = await req('POST', `/v1/auth/${realm}/login`, { body: { email, password: PASSWORD } });
  const verify = await req('POST', `/v1/auth/${realm}/verify-otp`, {
    body: { challengeId: login.body.challengeId, code: login.body.devCode },
  });
  assert.equal(verify.status, 200, 'verify-otp should succeed');
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

test('SEC-A1: login → email OTP → verify issues a session; /me returns the principal', async () => {
  const email = await createSystemUser(['ADMIN']);
  const login = await req('POST', '/v1/auth/admin/login', { body: { email, password: PASSWORD } });
  assert.equal(login.status, 200);
  assert.ok(login.body.challengeId);
  assert.match(String(login.body.devCode), /^\d{6}$/);

  const verify = await req('POST', '/v1/auth/admin/verify-otp', {
    body: { challengeId: login.body.challengeId, code: login.body.devCode },
  });
  assert.equal(verify.status, 200);
  assert.ok(verify.cookies.some((c) => c.startsWith('ic_admin_session=')));
  assert.ok(verify.cookies.some((c) => c.includes('HttpOnly')));

  const me = await req('GET', '/v1/auth/admin/me', { cookie: cookieHeader(verify.cookies) });
  assert.equal(me.status, 200);
  assert.equal(me.body.scope, 'SYSTEM');
  assert.deepEqual(me.body.roles, ['ADMIN']);
});

test('SEC-A1: OTP is single-use', async () => {
  const email = await createSystemUser(['ADMIN']);
  const login = await req('POST', '/v1/auth/admin/login', { body: { email, password: PASSWORD } });
  const first = await req('POST', '/v1/auth/admin/verify-otp', {
    body: { challengeId: login.body.challengeId, code: login.body.devCode },
  });
  assert.equal(first.status, 200);
  const reuse = await req('POST', '/v1/auth/admin/verify-otp', {
    body: { challengeId: login.body.challengeId, code: login.body.devCode },
  });
  assert.equal(reuse.status, 401);
});

test('SEC-A5: repeated wrong passwords lock the account', async () => {
  const email = await createSystemUser(['ADMIN']);
  for (let i = 0; i < 5; i += 1) {
    const r = await req('POST', '/v1/auth/admin/login', { body: { email, password: 'wrong' } });
    assert.equal(r.status, 401);
  }
  // Even the correct password is now rejected while locked.
  const locked = await req('POST', '/v1/auth/admin/login', { body: { email, password: PASSWORD } });
  assert.equal(locked.status, 401);
});

test('SEC-A3/A6: refresh rotates; reusing the old refresh is rejected; logout revokes', async () => {
  const email = await createSystemUser(['ADMIN']);
  const login = await req('POST', '/v1/auth/admin/login', { body: { email, password: PASSWORD } });
  const verify = await req('POST', '/v1/auth/admin/verify-otp', {
    body: { challengeId: login.body.challengeId, code: login.body.devCode },
  });
  const original = cookieHeader(verify.cookies);

  const rotated = await req('POST', '/v1/auth/admin/refresh', { cookie: original });
  assert.equal(rotated.status, 200);
  const rotatedCookie = cookieHeader(rotated.cookies);

  // Reusing the original refresh token now fails (rotation/theft response).
  const reuse = await req('POST', '/v1/auth/admin/refresh', { cookie: original });
  assert.equal(reuse.status, 401);

  // Logout revokes the rotated session.
  const out = await req('POST', '/v1/auth/admin/logout', { cookie: rotatedCookie });
  assert.equal(out.status, 200);
  const afterLogout = await req('POST', '/v1/auth/admin/refresh', { cookie: rotatedCookie });
  assert.equal(afterLogout.status, 401);
});

test('SEC-Z1/Z3: ADMIN can review a merchant; FINANCE cannot', async () => {
  const m = await pool.query<{ id: string }>(
    "INSERT INTO merchants (name, merchant_type, email, status) VALUES ('Acme','PRIVATE',$1,'PENDING') RETURNING id",
    [`merchant-${randomUUID()}@x.zm`],
  );
  const merchantId = m.rows[0].id;

  const financeCookie = await authenticate('admin', await createSystemUser(['FINANCE']));
  const denied = await req('POST', `/v1/admin/merchants/${merchantId}/review`, {
    cookie: financeCookie,
    body: { decision: 'APPROVED' },
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error?.code, 'FORBIDDEN');

  const adminCookie = await authenticate('admin', await createSystemUser(['ADMIN', 'COMPLIANCE']));
  const ok = await req('POST', `/v1/admin/merchants/${merchantId}/review`, {
    cookie: adminCookie,
    body: { decision: 'APPROVED' },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'APPROVED');
});

test('SEC-A4: a merchant session cannot use admin endpoints (wrong realm)', async () => {
  // A merchant-scope user with a password.
  const m = await pool.query<{ id: string }>(
    "INSERT INTO merchants (name, merchant_type, email, status) VALUES ('M','PRIVATE',$1,'APPROVED') RETURNING id",
    [`mu-${randomUUID()}@x.zm`],
  );
  const email = `mu-${randomUUID()}@x.zm`;
  const u = await pool.query<{ id: string }>(
    "INSERT INTO users (scope, merchant_id, name, email, status) VALUES ('MERCHANT',$1,'U',$2,'INVITED') RETURNING id",
    [m.rows[0].id, email],
  );
  await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [u.rows[0].id, 'MERCHANT_ADMIN']);
  await auth.setPassword(u.rows[0].id, PASSWORD);

  const merchantCookie = await authenticate('merchant', email);
  const denied = await req('POST', `/v1/admin/merchants/${m.rows[0].id}/review`, {
    cookie: merchantCookie,
    body: { decision: 'APPROVED' },
  });
  assert.equal(denied.status, 403);
});

test('protected endpoints reject missing/invalid tokens', async () => {
  const none = await req('GET', '/v1/auth/admin/me');
  assert.equal(none.status, 401);
  const bad = await req('GET', '/v1/auth/admin/me', { cookie: 'ic_admin_session=not-a-jwt' });
  assert.equal(bad.status, 401);
});

test('SEC-Z3 end-to-end: ADMIN provisions an account, FINANCE credits its float', async () => {
  // Approved merchant.
  const m = await pool.query<{ id: string }>(
    "INSERT INTO merchants (name, merchant_type, email, status) VALUES ('E','PRIVATE',$1,'APPROVED') RETURNING id",
    [`e-${randomUUID()}@x.zm`],
  );
  const merchantId = m.rows[0].id;

  const adminCookie = await authenticate('admin', await createSystemUser(['ADMIN']));
  const provisioned = await req('POST', `/v1/admin/merchants/${merchantId}/accounts`, {
    cookie: adminCookie,
    body: { accountType: 'COLLECTION' },
  });
  assert.equal(provisioned.status, 201);
  const accountId = String(provisioned.body.accountId);

  const financeCookie = await authenticate('admin', await createSystemUser(['FINANCE']));
  const credited = await req('POST', `/v1/admin/accounts/${accountId}/float-credit`, {
    cookie: financeCookie,
    body: { amount: '5000000' },
  });
  assert.equal(credited.status, 200);
  assert.equal(credited.body.posted, true);
});

test('admin reads: dashboard, create+list merchants, float-requests', async () => {
  const cookie = await authenticate('admin', await createSystemUser(['ADMIN']));

  const dash = await req('GET', '/v1/admin/dashboard', { cookie });
  assert.equal(dash.status, 200);
  assert.equal(typeof dash.body.totalVolume, 'number');
  assert.ok(Array.isArray(dash.body.byProcessor));

  const created = await req('POST', '/v1/admin/merchants', {
    cookie,
    body: {
      merchant: { name: 'Reads Ltd', merchantType: 'PRIVATE', email: `r-${randomUUID()}@x.zm` },
      admin: { name: 'Reader', email: `ra-${randomUUID()}@x.zm` },
    },
  });
  assert.equal(created.status, 201);
  const merchantId = String(created.body.merchantId);

  const list = await req('GET', '/v1/admin/merchants', { cookie });
  assert.equal(list.status, 200);
  assert.ok((list.body as unknown as unknown[]).some((m) => (m as { id: string }).id === merchantId));

  const detail = await req('GET', `/v1/admin/merchants/${merchantId}`, { cookie });
  assert.equal(detail.status, 200);
  assert.ok(Array.isArray((detail.body as { accounts: unknown[] }).accounts));

  const requests = await req('GET', '/v1/admin/float-requests', { cookie });
  assert.equal(requests.status, 200);
  assert.ok(Array.isArray(requests.body as unknown as unknown[]));
});

test('§6.1.5: create a report and download it as CSV', async () => {
  const cookie = await authenticate('admin', await createSystemUser(['ADMIN']));
  // a transaction within range
  const m = await pool.query<{ id: string }>("INSERT INTO merchants (name,merchant_type,email) VALUES ('Rep','PRIVATE',$1) RETURNING id", [`rep-${randomUUID()}@x.zm`]);
  const a = await pool.query<{ id: string }>("INSERT INTO accounts (merchant_id,account_type) VALUES ($1,'COLLECTION') RETURNING id", [m.rows[0].id]);
  await pool.query(
    `INSERT INTO transactions (account_id,type,processor,amount,net_amount,total_amount,status,idempotency_key,environment) VALUES ($1,'COLLECTION','MTN',12345,12345,12345,'SUCCESS',$2,'SANDBOX')`,
    [a.rows[0].id, randomUUID()],
  );

  const created = await req('POST', '/v1/admin/reports', {
    cookie,
    body: { name: 'All transactions', reportType: 'TRANSACTIONS', from: '2020-01-01', to: '2100-01-01' },
  });
  assert.equal(created.status, 201);
  const reportId = String(created.body.id);

  const list = (await req('GET', '/v1/admin/reports', { cookie })).body as unknown as Array<{ id: string }>;
  assert.ok(list.some((r) => r.id === reportId));

  // Download CSV (raw fetch — not JSON).
  const dl = await fetch(`${BASE}/v1/admin/reports/${reportId}/export`, { headers: { cookie } });
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get('content-type') ?? '', /text\/csv/);
  const csv = await dl.text();
  assert.match(csv, /^id,account_id,type,processor/); // header row
  assert.match(csv, /12345/); // the seeded amount
});

test('§6.1.8: notifications surface derived alerts', async () => {
  // Seed conditions: low-float account, a given-up webhook, a pending approval.
  const m = await pool.query<{ id: string }>(
    "INSERT INTO merchants (name, merchant_type, email) VALUES ('Notif','PRIVATE',$1) RETURNING id",
    [`n-${randomUUID()}@x.zm`],
  );
  const a = await pool.query<{ id: string }>(
    "INSERT INTO accounts (merchant_id, account_type, float_balance, low_float_threshold) VALUES ($1,'COLLECTION',100,5000) RETURNING id",
    [m.rows[0].id],
  );
  const accountId = a.rows[0].id;
  const t = await pool.query<{ id: string }>(
    `INSERT INTO transactions (account_id, type, processor, amount, net_amount, total_amount, status, idempotency_key, environment)
     VALUES ($1,'COLLECTION','MTN',1000,1000,1000,'SUCCESS',$2,'SANDBOX') RETURNING id`,
    [accountId, randomUUID()],
  );
  await pool.query(
    "INSERT INTO webhook_deliveries (transaction_id, url, attempt, status) VALUES ($1,'https://x/cb',6,'GIVEN_UP')",
    [t.rows[0].id],
  );
  await pool.query(
    "INSERT INTO float_credit_requests (account_id, amount, requested_by, status) VALUES ($1,9999999,$2,'PENDING_APPROVAL')",
    [accountId, randomUUID()],
  );

  const cookie = await authenticate('admin', await createSystemUser(['ADMIN']));
  const res = await req('GET', '/v1/admin/notifications', { cookie });
  assert.equal(res.status, 200);
  const body = res.body as {
    counts: Record<string, number>;
    lowFloat: Array<{ account_id: string }>;
    givenUpWebhooks: Array<{ transaction_id: string }>;
    pendingApprovals: Array<{ account_id: string }>;
  };
  assert.ok(body.lowFloat.some((x) => x.account_id === accountId), 'low-float alert');
  assert.ok(body.givenUpWebhooks.some((x) => x.transaction_id === t.rows[0].id), 'given-up webhook alert');
  assert.ok(body.pendingApprovals.some((x) => x.account_id === accountId), 'pending approval alert');
  assert.ok(body.counts.lowFloat >= 1 && body.counts.givenUpWebhooks >= 1);
});

test('§6.1.6: security — audit log (role-gated) + session revoke (forced logout)', async () => {
  const adminCookie = await authenticate('admin', await createSystemUser(['ADMIN']));

  // Generate an auditable action, then read the append-only log.
  await req('POST', '/v1/admin/merchants', {
    cookie: adminCookie,
    body: { merchant: { name: 'Aud', merchantType: 'PRIVATE', email: `a-${randomUUID()}@x.zm` }, admin: { name: 'A', email: `aa-${randomUUID()}@x.zm` } },
  });
  const logs = (await req('GET', '/v1/admin/audit-logs', { cookie: adminCookie }))
    .body as unknown as Array<{ action: string }>;
  assert.ok(logs.some((l) => l.action === 'MERCHANT_REGISTERED'));

  // Audit log is gated: FINANCE (not AUDITOR/ADMIN/COMPLIANCE) is denied.
  const financeCookie = await authenticate('admin', await createSystemUser(['FINANCE']));
  assert.equal((await req('GET', '/v1/admin/audit-logs', { cookie: financeCookie })).status, 403);

  // A victim user logs in, then the admin force-logs-them-out (SEC-A6).
  const victimEmail = `v-${randomUUID()}@x.zm`;
  const vu = await pool.query<{ id: string }>(
    "INSERT INTO users (scope, name, email, status) VALUES ('SYSTEM','V',$1,'INVITED') RETURNING id",
    [victimEmail],
  );
  await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [vu.rows[0].id, 'AUDITOR']);
  await auth.setPassword(vu.rows[0].id, PASSWORD);
  const vLogin = await req('POST', '/v1/auth/admin/login', { body: { email: victimEmail, password: PASSWORD } });
  const vVerify = await req('POST', '/v1/auth/admin/verify-otp', { body: { challengeId: vLogin.body.challengeId, code: vLogin.body.devCode } });
  const vCookie = cookieHeader(vVerify.cookies);

  const sessions = (await req('GET', '/v1/admin/sessions', { cookie: adminCookie }))
    .body as unknown as Array<{ user_id: string }>;
  assert.ok(sessions.some((s) => s.user_id === vu.rows[0].id));

  const revoked = await req('POST', `/v1/admin/users/${vu.rows[0].id}/sessions/revoke-all`, { cookie: adminCookie });
  assert.equal(revoked.status, 200);
  // The victim's refresh token no longer works.
  assert.equal((await req('POST', '/v1/auth/admin/refresh', { cookie: vCookie })).status, 401);
});

test('§6.1.9: admin creates a user who can then log in; role assign/remove; custom role', async () => {
  const adminCookie = await authenticate('admin', await createSystemUser(['ADMIN']));
  const newEmail = `nu-${randomUUID()}@x.zm`;

  // Create a SYSTEM user with FINANCE and an initial password.
  const created = await req('POST', '/v1/admin/users', {
    cookie: adminCookie,
    body: { name: 'New Operator', email: newEmail, scope: 'SYSTEM', role: 'FINANCE', password: 'temp-pass-123' },
  });
  assert.equal(created.status, 201);
  const userId = String(created.body.userId);

  // The created user can log in end-to-end (bootstrapping the team).
  const login = await req('POST', '/v1/auth/admin/login', { body: { email: newEmail, password: 'temp-pass-123' } });
  assert.equal(login.status, 200);
  const verify = await req('POST', '/v1/auth/admin/verify-otp', {
    body: { challengeId: login.body.challengeId, code: login.body.devCode },
  });
  assert.equal(verify.status, 200);
  const me = await req('GET', '/v1/auth/admin/me', { cookie: cookieHeader(verify.cookies) });
  assert.deepEqual(me.body.roles, ['FINANCE']);

  // Assign ADMIN, then remove FINANCE.
  assert.equal((await req('POST', `/v1/admin/users/${userId}/roles`, { cookie: adminCookie, body: { role: 'ADMIN' } })).status, 200);
  assert.equal((await req('DELETE', `/v1/admin/users/${userId}/roles/FINANCE`, { cookie: adminCookie })).status, 200);
  const users = (await req('GET', '/v1/admin/users?scope=SYSTEM', { cookie: adminCookie }))
    .body as unknown as Array<{ id: string; roles: string[] }>;
  const row = users.find((u) => u.id === userId);
  assert.deepEqual(row?.roles, ['ADMIN']);

  // Custom role appears in the roles list.
  const roleName = `TREASURY_${randomUUID().slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;
  assert.equal((await req('POST', '/v1/admin/roles', { cookie: adminCookie, body: { name: roleName } })).status, 201);
  const roles = (await req('GET', '/v1/admin/roles', { cookie: adminCookie }))
    .body as unknown as Array<{ name: string }>;
  assert.ok(roles.some((r) => r.name === roleName));

  // A non-ADMIN cannot create users.
  const financeCookie = await authenticate('admin', await createSystemUser(['FINANCE']));
  assert.equal((await req('POST', '/v1/admin/users', { cookie: financeCookie, body: { name: 'X', email: `x-${randomUUID()}@x.zm`, scope: 'SYSTEM', role: 'AUDITOR', password: 'temp-pass-123' } })).status, 403);
});

test('§6.1.2: admin manage-account config — mode, charge config, settings', async () => {
  // Approved merchant + provisioned account via admin endpoints.
  const m = await pool.query<{ id: string }>(
    "INSERT INTO merchants (name, merchant_type, email, status) VALUES ('Cfg','PRIVATE',$1,'APPROVED') RETURNING id",
    [`cfg-${randomUUID()}@x.zm`],
  );
  const cookie = await authenticate('admin', await createSystemUser(['ADMIN']));
  const provisioned = await req('POST', `/v1/admin/merchants/${m.rows[0].id}/accounts`, {
    cookie,
    body: { accountType: 'COLLECTION' },
  });
  const accountId = String(provisioned.body.accountId);

  // Operating mode toggle
  const mode = await req('POST', `/v1/admin/accounts/${accountId}/mode`, { cookie, body: { mode: 'PRODUCTION' } });
  assert.equal(mode.status, 200);

  // Charge configuration (per processor)
  const charge = await req('PUT', `/v1/admin/accounts/${accountId}/charge-config`, {
    cookie,
    body: { processor: 'MTN', chargeFulfiller: 'SOURCE', chargeType: 'PERCENTAGE', percentValue: '2.50' },
  });
  assert.equal(charge.status, 200);

  // Callback URL + IP whitelist
  const settings = await req('PUT', `/v1/admin/accounts/${accountId}/settings`, {
    cookie,
    body: { callbackUrl: 'https://m.example/cb', ipWhitelist: ['41.1.2.3'] },
  });
  assert.equal(settings.status, 200);

  // Read it all back
  const cfg = await req('GET', `/v1/admin/accounts/${accountId}/config`, { cookie });
  assert.equal(cfg.status, 200);
  assert.equal((cfg.body as { account: { operating_mode: string } }).account.operating_mode, 'PRODUCTION');
  const charges = (cfg.body as { chargeConfigs: Array<{ processor: string; percent_value: string }> }).chargeConfigs;
  assert.equal(charges[0].processor, 'MTN');
  assert.equal(charges[0].percent_value, '2.50');
  assert.equal((cfg.body as { settings: { callback_url: string } }).settings.callback_url, 'https://m.example/cb');
});

test('admin authorized reversal (§6.1.3)', async () => {
  const m = await pool.query<{ id: string }>(
    "INSERT INTO merchants (name, merchant_type, email) VALUES ('Rv','PRIVATE',$1) RETURNING id",
    [`rv-${randomUUID()}@x.zm`],
  );
  const a = await pool.query<{ id: string }>(
    "INSERT INTO accounts (merchant_id, account_type) VALUES ($1,'COLLECTION') RETURNING id",
    [m.rows[0].id],
  );
  const t = await pool.query<{ id: string }>(
    `INSERT INTO transactions (account_id, type, processor, amount, charge, net_amount, total_amount, status, idempotency_key, environment)
     VALUES ($1,'COLLECTION','MTN',100000,500,100000,100500,'SUCCESS',$2,'SANDBOX') RETURNING id`,
    [a.rows[0].id, randomUUID()],
  );

  const cookie = await authenticate('admin', await createSystemUser(['ADMIN']));
  const reversed = await req('POST', `/v1/admin/transactions/${t.rows[0].id}/reverse`, { cookie });
  assert.equal(reversed.status, 200);
  assert.equal(reversed.body.status, 'REVERSED');
});

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';

// Fixed test env BEFORE any module loads crypto/config.
process.env.API_SIGNING_ENC_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.DUAL_CONTROL_THRESHOLD = '1000000000';
process.env.API_RATE_MAX = '100000';
process.env.WEBHOOK_WORKER = 'off'; // no background delivery loop during API tests

import { AppModule } from '../src/app.module';
import { ApiErrorFilter } from '../src/api/api-error.filter';
import { createPool } from '../src/database/database.module';
import { CredentialService } from '../src/credentials/credential.service';
import { FloatService } from '../src/float/float.service';
import { canonicalRequest, signRequest } from '../src/credentials/crypto';

const PORT = 8099;
const BASE = `http://127.0.0.1:${PORT}`;
const pool = createPool(process.env.DATABASE_URL);

let app: INestApplication;
let creds: CredentialService;
let floats: FloatService;

interface Cred {
  accountId: string;
  apiKey: string;
  signingKey: string;
}

async function seedAccount(opts: {
  charge?: bigint;
  credit?: bigint;
  environment?: 'SANDBOX' | 'LIVE';
  whitelist?: string[];
}): Promise<Cred> {
  const m = await pool.query<{ id: string }>(
    "INSERT INTO merchants (name, merchant_type, email) VALUES ('T','PRIVATE','t@t.zm') RETURNING id",
  );
  const mode = opts.environment === 'LIVE' ? 'PRODUCTION' : 'SANDBOX';
  const a = await pool.query<{ id: string }>(
    'INSERT INTO accounts (merchant_id, account_type, operating_mode) VALUES ($1,$2,$3) RETURNING id',
    [m.rows[0].id, 'COLLECTION', mode],
  );
  const accountId = a.rows[0].id;
  await pool.query(
    `INSERT INTO charge_configs (account_id, processor, charge_fulfiller, charge_type, fixed_value)
     VALUES ($1,'MTN','SOURCE','FIXED',$2)`,
    [accountId, (opts.charge ?? 0n).toString()],
  );
  if (opts.whitelist) {
    await pool.query(
      'INSERT INTO account_settings (account_id, ip_whitelist) VALUES ($1,$2)',
      [accountId, opts.whitelist],
    );
  }
  if (opts.credit && opts.credit > 0n) {
    await floats.creditFloat({ accountId, amount: opts.credit, actorId: randomUUID() });
  }
  const generated = await creds.generate({ accountId, environment: opts.environment ?? 'SANDBOX' });
  return { accountId, apiKey: generated.apiKey, signingKey: generated.signingKey };
}

interface SignOpts {
  body?: object;
  cred: Cred;
  idem?: string;
  ts?: number;
  signature?: string;
}

async function call(
  method: string,
  path: string,
  opts: SignOpts,
): Promise<{ status: number; body: { error?: { code: string }; [k: string]: unknown } }> {
  const rawBody = opts.body ? JSON.stringify(opts.body) : '';
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const signature =
    opts.signature ??
    signRequest(opts.cred.signingKey, canonicalRequest({ timestamp: ts, method, path, rawBody }));
  const headers: Record<string, string> = {
    'x-api-key': opts.cred.apiKey,
    'x-timestamp': ts,
    'x-signature': signature,
  };
  if (opts.body) headers['content-type'] = 'application/json';
  if (opts.idem) headers['idempotency-key'] = opts.idem;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(rawBody === '' ? {} : { body: rawBody }),
  });
  return { status: res.status, body: (await res.json()) as { error?: { code: string } } };
}

before(async () => {
  app = await NestFactory.create(AppModule, { rawBody: true, logger: false });
  app.setGlobalPrefix('v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'onboarding/applications', method: RequestMethod.POST },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ApiErrorFilter());
  await app.listen(PORT, '127.0.0.1');
  creds = app.get(CredentialService, { strict: false });
  floats = app.get(FloatService, { strict: false });
});

after(async () => {
  await app.close();
  await pool.end();
});

test('POST /v1/collections: signed request creates a PROCESSING transaction', async () => {
  const cred = await seedAccount({ charge: 500n, credit: 1_000_000n });
  const res = await call('POST', '/v1/collections', {
    cred,
    idem: 'c1',
    body: { processor: 'MTN', amount: '100000', msisdn: '260970000001' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'PROCESSING');
  assert.equal(res.body.charge, '500');
  assert.equal(res.body.amount, '100000');
});

test('GET /v1/transactions/{id} returns status, scoped to the account', async () => {
  const cred = await seedAccount({ charge: 0n, credit: 1_000_000n });
  const created = await call('POST', '/v1/collections', {
    cred, idem: 'c-stat', body: { processor: 'MTN', amount: '5000', msisdn: '260970000001' },
  });
  const id = String(created.body.id);
  const got = await call('GET', `/v1/transactions/${id}`, { cred });
  assert.equal(got.status, 200);
  assert.equal(got.body.id, id);
});

test('GET /v1/accounts/{id}/balance reflects the debit', async () => {
  const cred = await seedAccount({ charge: 500n, credit: 1_000_000n });
  await call('POST', '/v1/collections', {
    cred, idem: 'c-bal', body: { processor: 'MTN', amount: '100000', msisdn: '260970000001' },
  });
  const res = await call('GET', `/v1/accounts/${cred.accountId}/balance`, { cred });
  assert.equal(res.status, 200);
  assert.equal(res.body.float_balance, '899500'); // 1_000_000 - 100500
});

test('invalid signature -> 401 INVALID_SIGNATURE', async () => {
  const cred = await seedAccount({ charge: 0n, credit: 1_000n });
  const res = await call('POST', '/v1/collections', {
    cred, idem: 'c-bad', signature: 'deadbeef',
    body: { processor: 'MTN', amount: '100', msisdn: '260970000001' },
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.error?.code, 'INVALID_SIGNATURE');
});

test('stale timestamp -> 401 (replay protection)', async () => {
  const cred = await seedAccount({ charge: 0n, credit: 1_000n });
  const res = await call('POST', '/v1/collections', {
    cred, idem: 'c-old', ts: Math.floor(Date.now() / 1000) - 4000,
    body: { processor: 'MTN', amount: '100', msisdn: '260970000001' },
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.error?.code, 'INVALID_SIGNATURE');
});

test('missing Idempotency-Key -> 400 VALIDATION_ERROR', async () => {
  const cred = await seedAccount({ charge: 0n, credit: 1_000n });
  const res = await call('POST', '/v1/collections', {
    cred, body: { processor: 'MTN', amount: '100', msisdn: '260970000001' },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error?.code, 'VALIDATION_ERROR');
});

test('idempotency: same key+body replays; different body -> 409 DUPLICATE_REQUEST', async () => {
  const cred = await seedAccount({ charge: 0n, credit: 1_000_000n });
  const body = { processor: 'MTN', amount: '50000', msisdn: '260970000001' };
  const first = await call('POST', '/v1/collections', { cred, idem: 'dup', body });
  const replay = await call('POST', '/v1/collections', { cred, idem: 'dup', body });
  assert.equal(first.body.id, replay.body.id); // same record

  const conflict = await call('POST', '/v1/collections', {
    cred, idem: 'dup', body: { ...body, amount: '60000' },
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error?.code, 'DUPLICATE_REQUEST');
});

test('insufficient float -> 200 with FAILED/INSUFFICIENT_FLOAT', async () => {
  const cred = await seedAccount({ charge: 500n, credit: 1_000n });
  const res = await call('POST', '/v1/collections', {
    cred, idem: 'c-poor', body: { processor: 'MTN', amount: '100000', msisdn: '260970000001' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'FAILED');
  assert.equal(res.body.failure_reason, 'INSUFFICIENT_FLOAT');
});

test('cross-account balance read -> 404 NOT_FOUND', async () => {
  const cred = await seedAccount({ charge: 0n, credit: 1_000n });
  const other = await seedAccount({ charge: 0n, credit: 1_000n });
  const res = await call('GET', `/v1/accounts/${other.accountId}/balance`, { cred });
  assert.equal(res.status, 404);
  assert.equal(res.body.error?.code, 'NOT_FOUND');
});

test('unknown body field -> 400 VALIDATION_ERROR', async () => {
  const cred = await seedAccount({ charge: 0n, credit: 1_000n });
  const res = await call('POST', '/v1/collections', {
    cred, idem: 'c-extra',
    body: { processor: 'MTN', amount: '100', msisdn: '260970000001', evil: 'x' },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error?.code, 'VALIDATION_ERROR');
});

test('LIVE key from non-whitelisted IP -> 403 IP_NOT_WHITELISTED', async () => {
  const cred = await seedAccount({ charge: 0n, environment: 'LIVE', whitelist: ['10.10.10.10'] });
  const res = await call('GET', `/v1/accounts/${cred.accountId}/balance`, { cred });
  assert.equal(res.status, 403);
  assert.equal(res.body.error?.code, 'IP_NOT_WHITELISTED');
});

test('GET /v1/settlements returns a (possibly empty) list', async () => {
  const cred = await seedAccount({ charge: 0n, credit: 1_000n });
  const res = await call('GET', '/v1/settlements', { cred });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

test('POST /onboarding/applications (public) -> 202 with received message', async () => {
  const res = await fetch(`${BASE}/onboarding/applications`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      merchant: { name: 'Acme', merchantType: 'PRIVATE', email: `m-${randomUUID()}@x.zm` },
      admin: { name: 'Jane', email: `j-${randomUUID()}@x.zm` },
    }),
  });
  const body = (await res.json()) as { merchant_id?: string; message?: string };
  assert.equal(res.status, 202);
  assert.ok(body.merchant_id);
  assert.match(String(body.message), /received your merchant onboarding application/);
});

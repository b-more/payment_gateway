#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Instacompay Gateway — API smoke test for QA / integration testers.
//
// Exercises the public v1 API end-to-end using the documented key + secret auth
// and asserts each step, including negative security cases. Optionally repeats
// the checks in hardened HMAC-signed mode. No dependencies — Node 18+ only.
//
// USAGE:
//   IC_API_KEY=ic_sand_xxx \
//   IC_API_SECRET=sk_your_secret \
//   IC_ACCOUNT_ID=your_account_uuid \
//   node testing/api-smoke-test.mjs
//
//   Optionally also set IC_SIGNING_KEY to additionally exercise the hardened
//   HMAC-signed mode (the same checks are run a second time, signed).
//
// Optional env:
//   IC_BASE_URL   (default https://api.instacompayzm.com)
//   IC_MSISDN     (default 260970000001)  test recipient/customer number
//   IC_PROCESSOR  (default AIRTEL)         only rails live in production are accepted
//   IC_AMOUNT     (default 5000)           integer ngwee (5000 = K50.00)
//
// Get your key + secret from the Merchant Portal → API Documentation
// (regenerate a SANDBOX key to reveal them). Use a SANDBOX key: it simulates,
// never moves real money, and never touches production float.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';

const BASE = (process.env.IC_BASE_URL ?? 'https://api.instacompayzm.com').replace(/\/$/, '');
const API_KEY = process.env.IC_API_KEY ?? '';
const API_SECRET = process.env.IC_API_SECRET ?? '';
const SIGNING_KEY = process.env.IC_SIGNING_KEY ?? ''; // optional: also test signed mode
const ACCOUNT_ID = process.env.IC_ACCOUNT_ID ?? '';
const MSISDN = process.env.IC_MSISDN ?? '260970000001';
const PROCESSOR = process.env.IC_PROCESSOR ?? 'AIRTEL';
const AMOUNT = process.env.IC_AMOUNT ?? '5000';

const C = { green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[90m', bold: '\x1b[1m', reset: '\x1b[0m', yellow: '\x1b[33m' };
const ok = (s) => `${C.green}✓${C.reset} ${s}`;
const bad = (s) => `${C.red}✗${C.reset} ${s}`;

if (!API_KEY || !API_SECRET || !ACCOUNT_ID) {
  console.error(`${C.red}Missing config.${C.reset} Set IC_API_KEY, IC_API_SECRET and IC_ACCOUNT_ID.`);
  console.error('Example:\n  IC_API_KEY=ic_sand_… IC_API_SECRET=sk_… IC_ACCOUNT_ID=… node testing/api-smoke-test.mjs');
  process.exit(2);
}
if (!API_KEY.startsWith('ic_sand_')) {
  console.error(`${C.yellow}WARNING:${C.reset} IC_API_KEY is not a sandbox key (ic_sand_…). Live keys move REAL money. Ctrl-C to abort.`);
}

// ── request signing: HMAC-SHA256(signingKey, "ts.METHOD.path.rawBody") ──
function sign(method, path, body, { badSig = false, staleTs = false } = {}) {
  const ts = staleTs ? String(Math.floor(Date.now() / 1000) - 3600) : String(Math.floor(Date.now() / 1000));
  const message = `${ts}.${method.toUpperCase()}.${path}.${body ?? ''}`;
  let signature = crypto.createHmac('sha256', SIGNING_KEY).update(message).digest('hex');
  if (badSig) signature = 'deadbeef' + signature.slice(8);
  return { ts, signature };
}

async function call(method, path, bodyObj, opts = {}) {
  const body = bodyObj ? JSON.stringify(bodyObj) : '';
  const headers = { 'X-Api-Key': API_KEY };

  if (opts.signed) {
    // Hardened mode: prove the call with an HMAC instead of sending the secret.
    const { ts, signature } = sign(method, path, body, opts);
    headers['X-Timestamp'] = ts;
    headers['X-Signature'] = signature;
  } else {
    // Documented default: key + secret.
    headers[opts.bearer ? 'Authorization' : 'X-Api-Secret'] =
      opts.bearer ? `Bearer ${opts.badSecret ? 'wrong' : API_SECRET}` : (opts.badSecret ? 'wrong' : API_SECRET);
  }

  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    if (!opts.noIdempotency) headers['Idempotency-Key'] = opts.idempotencyKey ?? crypto.randomUUID();
  }
  const res = await fetch(BASE + path, { method, headers, body: body || undefined });
  let json = null;
  try { json = await res.json(); } catch { /* non-json */ }
  return { status: res.status, json };
}

// ── tiny test runner ──
let passed = 0, failed = 0;
const results = [];
async function test(name, fn) {
  try {
    await fn();
    passed++; results.push(ok(name)); console.log(ok(name));
  } catch (e) {
    failed++; const line = bad(`${name}\n    ${C.dim}${e.message}${C.reset}`); results.push(line); console.log(line);
  }
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }

console.log(`${C.bold}Instacompay API smoke test${C.reset} ${C.dim}→ ${BASE}${C.reset}`);
console.log(`${C.dim}account ${ACCOUNT_ID} · ${PROCESSOR} · ${AMOUNT} ngwee → ${MSISDN}${C.reset}\n`);

// 1. Balance enquiry
await test('GET  /v1/accounts/{id}/balance  → 200, ngwee balance', async () => {
  const r = await call('GET', `/v1/accounts/${ACCOUNT_ID}/balance`);
  expect(r.status === 200, `expected 200, got ${r.status} ${JSON.stringify(r.json)}`);
  expect(typeof r.json?.float_balance === 'string', 'float_balance should be a string of ngwee');
});

// 2. Collection
let collectionId = null;
await test('POST /v1/collections               → 200, transaction created', async () => {
  const r = await call('POST', '/v1/collections', { processor: PROCESSOR, amount: AMOUNT, msisdn: MSISDN, collectionReference: 'qa-collect' });
  expect(r.status === 200, `expected 200, got ${r.status} ${JSON.stringify(r.json)}`);
  expect(r.json?.type === 'COLLECTION', 'type should be COLLECTION');
  expect(typeof r.json?.id === 'string', 'response should carry a transaction id');
  expect(['PROCESSING', 'SUCCESS', 'FAILED'].includes(r.json?.status), `unexpected status ${r.json?.status}`);
  collectionId = r.json.id;
});

// 3. Transaction status
await test('GET  /v1/transactions/{id}         → 200, matches the collection', async () => {
  expect(collectionId, 'no collection id from previous step');
  const r = await call('GET', `/v1/transactions/${collectionId}`);
  expect(r.status === 200, `expected 200, got ${r.status}`);
  expect(r.json?.id === collectionId, 'returned id should match');
});

// 4. Idempotent replay — same key returns the original transaction
await test('POST /v1/collections (replay key)  → same transaction id', async () => {
  const key = crypto.randomUUID();
  const body = { processor: PROCESSOR, amount: AMOUNT, msisdn: MSISDN, collectionReference: 'qa-idem' };
  const first = await call('POST', '/v1/collections', body, { idempotencyKey: key });
  const second = await call('POST', '/v1/collections', body, { idempotencyKey: key });
  expect(first.status === 200 && second.status === 200, 'both replays should be 200');
  expect(first.json?.id === second.json?.id, `replay returned a different id (${first.json?.id} vs ${second.json?.id})`);
});

// 5. Disbursement
await test('POST /v1/disbursements            → 200, transaction created', async () => {
  const r = await call('POST', '/v1/disbursements', { processor: PROCESSOR, amount: AMOUNT, msisdn: MSISDN, collectionReference: 'qa-payout' });
  expect(r.status === 200, `expected 200, got ${r.status} ${JSON.stringify(r.json)}`);
  expect(r.json?.type === 'DISBURSEMENT', 'type should be DISBURSEMENT');
});

// 6. Settlements
await test('GET  /v1/settlements               → 200, list', async () => {
  const r = await call('GET', '/v1/settlements');
  expect(r.status === 200, `expected 200, got ${r.status}`);
  expect(Array.isArray(r.json), 'settlements should be an array');
});

// ── negative / security cases ──
console.log(`\n${C.dim}negative & security checks${C.reset}`);

await test('SEC  wrong secret                   → 401 rejected', async () => {
  const r = await call('POST', '/v1/collections', { processor: PROCESSOR, amount: AMOUNT, msisdn: MSISDN }, { badSecret: true });
  expect(r.status === 401, `expected 401, got ${r.status}`);
});

await test('AUTH Authorization: Bearer <secret> → 200 accepted', async () => {
  const r = await call('GET', `/v1/accounts/${ACCOUNT_ID}/balance`, undefined, { bearer: true });
  expect(r.status === 200, `expected 200, got ${r.status}`);
});

if (SIGNING_KEY) {
  await test('AUTH signed (HMAC) mode            → 200 accepted', async () => {
    const r = await call('POST', '/v1/collections', { processor: PROCESSOR, amount: AMOUNT, msisdn: MSISDN }, { signed: true });
    expect(r.status === 200, `expected 200, got ${r.status} ${JSON.stringify(r.json)}`);
  });
  await test('SEC  signed: tampered signature     → 401 rejected', async () => {
    const r = await call('POST', '/v1/collections', { processor: PROCESSOR, amount: AMOUNT, msisdn: MSISDN }, { signed: true, badSig: true });
    expect(r.status === 401, `expected 401, got ${r.status}`);
  });
  await test('SEC  signed: stale timestamp (−1h)  → 401 rejected', async () => {
    const r = await call('POST', '/v1/collections', { processor: PROCESSOR, amount: AMOUNT, msisdn: MSISDN }, { signed: true, staleTs: true });
    expect(r.status === 401, `expected 401, got ${r.status}`);
  });
}

await test('SEC  missing Idempotency-Key       → 4xx rejected', async () => {
  const r = await call('POST', '/v1/collections', { processor: PROCESSOR, amount: AMOUNT, msisdn: MSISDN }, { noIdempotency: true });
  expect(r.status >= 400 && r.status < 500, `expected a 4xx, got ${r.status}`);
});

await test('SEC  balance of a foreign account  → 404 (account scoping)', async () => {
  const r = await call('GET', `/v1/accounts/${crypto.randomUUID()}/balance`);
  expect(r.status === 404, `expected 404, got ${r.status}`);
});

// ── summary ──
console.log(`\n${C.bold}Result:${C.reset} ${C.green}${passed} passed${C.reset}, ${failed ? C.red : C.dim}${failed} failed${C.reset}`);
process.exit(failed ? 1 : 0);

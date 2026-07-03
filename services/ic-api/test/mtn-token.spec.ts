import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MtnTokenManager } from '../src/mtn/mtn-token.manager';
import type { MtnProduct, MtnProductConfig } from '../src/mtn/mtn.config';

function cfgFor(product: MtnProduct): MtnProductConfig {
  return {
    product,
    env: 'PRODUCTION',
    baseUrl: 'https://proxy.momoapi.mtn.com',
    subscriptionKey: `sub-${product}`,
    apiUser: `user-${product}`,
    apiKey: `key-${product}`,
    tokenPath: product === 'COLLECTION' ? '/collection/token/' : '/disbursement/token/',
  };
}

function tokenResponse(token: string, expiresIn = 3600): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ access_token: token, token_type: 'access_token', expires_in: expiresIn }),
    text: async () => '',
    headers: { get: () => null },
  } as unknown as Response;
}

test('caches per product within TTL (one fetch each)', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    return tokenResponse('tok');
  }) as unknown as typeof fetch;
  const m = new MtnTokenManager(cfgFor, fetchImpl, () => 1_000_000);

  await m.getToken('COLLECTION');
  await m.getToken('COLLECTION'); // cached
  await m.getToken('DISBURSEMENT');
  assert.equal(calls.length, 2);
  assert.ok(calls[0].endsWith('/collection/token/'));
  assert.ok(calls[1].endsWith('/disbursement/token/'));
});

test('sends Basic auth + subscription-key header', async () => {
  let headers: Record<string, string> = {};
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    headers = init.headers as Record<string, string>;
    return tokenResponse('tok');
  }) as unknown as typeof fetch;
  const m = new MtnTokenManager(cfgFor, fetchImpl, () => 1_000_000);

  await m.getToken('COLLECTION');
  const expected = 'Basic ' + Buffer.from('user-COLLECTION:key-COLLECTION').toString('base64');
  assert.equal(headers.Authorization, expected);
  assert.equal(headers['Ocp-Apim-Subscription-Key'], 'sub-COLLECTION');
});

test('refreshes proactively when <60s remain', async () => {
  let calls = 0;
  const clock = { t: 1_000_000 };
  const fetchImpl = (async () => {
    calls++;
    return tokenResponse(`tok-${calls}`);
  }) as unknown as typeof fetch;
  const m = new MtnTokenManager(cfgFor, fetchImpl, () => clock.t);

  assert.equal(await m.getToken('COLLECTION'), 'tok-1');
  clock.t += 3_570_000; // 30s left of 3600s — inside the 60s skew
  assert.equal(await m.getToken('COLLECTION'), 'tok-2');
  assert.equal(calls, 2);
});

test('single-flight: concurrent calls trigger one refresh', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return tokenResponse('tok');
  }) as unknown as typeof fetch;
  const m = new MtnTokenManager(cfgFor, fetchImpl, () => 1_000_000);

  await Promise.all([m.getToken('COLLECTION'), m.getToken('COLLECTION'), m.getToken('COLLECTION')]);
  assert.equal(calls, 1);
});

test('a failed token response throws MtnError', async () => {
  const fetchImpl = (async () =>
    ({
      ok: false,
      status: 401,
      json: async () => ({ message: 'invalid credentials' }),
      text: async () => '{"message":"invalid credentials"}',
      headers: { get: () => null },
    }) as unknown as Response) as unknown as typeof fetch;
  const m = new MtnTokenManager(cfgFor, fetchImpl, () => 1_000_000);
  await assert.rejects(() => m.getToken('COLLECTION'), /invalid credentials/);
});

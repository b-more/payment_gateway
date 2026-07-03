import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AirtelTokenManager } from '../src/airtel/airtel-token.manager';
import type { AirtelEnvConfig } from '../src/airtel/airtel.config';

const CFG: AirtelEnvConfig = {
  env: 'STAGING',
  baseUrl: 'https://airtel.test',
  clientId: 'id',
  clientSecret: 'sec',
  publicKeyBase64: '',
  disbursePin: '',
};

function tokenResponse(token: string, expiresIn = 180): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ access_token: token, expires_in: expiresIn, token_type: 'bearer' }),
    headers: { get: () => null },
  } as unknown as Response;
}

test('caches the token within its TTL (one fetch)', async () => {
  let calls = 0;
  const clock = { t: 1_000_000 };
  const fetchImpl = (async () => {
    calls++;
    return tokenResponse(`tok-${calls}`);
  }) as unknown as typeof fetch;
  const m = new AirtelTokenManager(() => CFG, fetchImpl, () => clock.t);

  assert.equal(await m.getToken(), 'tok-1');
  assert.equal(await m.getToken(), 'tok-1'); // cached
  assert.equal(calls, 1);
});

test('refreshes proactively when <30s remain', async () => {
  let calls = 0;
  const clock = { t: 1_000_000 };
  const fetchImpl = (async () => {
    calls++;
    return tokenResponse(`tok-${calls}`);
  }) as unknown as typeof fetch;
  const m = new AirtelTokenManager(() => CFG, fetchImpl, () => clock.t);

  assert.equal(await m.getToken(), 'tok-1');
  clock.t += 160_000; // 20s left of 180s — inside the 30s skew
  assert.equal(await m.getToken(), 'tok-2');
  assert.equal(calls, 2);
});

test('single-flight: concurrent calls trigger one refresh', async () => {
  let calls = 0;
  const clock = { t: 1_000_000 };
  const fetchImpl = (async () => {
    calls++;
    return tokenResponse('tok');
  }) as unknown as typeof fetch;
  const m = new AirtelTokenManager(() => CFG, fetchImpl, () => clock.t);

  const [a, b, c] = await Promise.all([m.getToken(), m.getToken(), m.getToken()]);
  assert.equal(a, 'tok');
  assert.equal(b, 'tok');
  assert.equal(c, 'tok');
  assert.equal(calls, 1);
});

test('force=true refreshes even when cached', async () => {
  let calls = 0;
  const clock = { t: 1_000_000 };
  const fetchImpl = (async () => {
    calls++;
    return tokenResponse(`tok-${calls}`);
  }) as unknown as typeof fetch;
  const m = new AirtelTokenManager(() => CFG, fetchImpl, () => clock.t);

  assert.equal(await m.getToken(), 'tok-1');
  assert.equal(await m.getToken(true), 'tok-2'); // forced (401 path)
  assert.equal(calls, 2);
});

test('a failed auth response throws AirtelError(AUTH)', async () => {
  const fetchImpl = (async () =>
    ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'invalid_token' }),
      headers: { get: () => null },
    }) as unknown as Response) as unknown as typeof fetch;
  const m = new AirtelTokenManager(() => CFG, fetchImpl, () => 1_000_000);

  await assert.rejects(() => m.getToken(), /invalid_token/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AirtelKycService } from '../src/airtel/airtel-kyc.service';
import type { AirtelResponse } from '../src/airtel/airtel.client';

function kycResp(data: Record<string, unknown>): AirtelResponse {
  return { httpStatus: 200, body: { data }, requestId: 'r', resultCode: 'ok' };
}
function svc(get: (path: string) => Promise<AirtelResponse>) {
  return new AirtelKycService({ get: get as never });
}

const OK = { first_name: 'Blessmore', last_name: 'Mulenga', is_barred: false, is_pin_set: true, registration: { status: 'REGISTERED' } };

test('registered, pin set, not barred -> canPay', async () => {
  const s = svc(async () => kycResp(OK));
  const r = await s.validatePayer('260975020473');
  assert.equal(r.canPay, true);
  assert.equal(r.registered, true);
  assert.equal(r.name, 'Blessmore Mulenga');
  assert.deepEqual(r.reasons, []);
  assert.equal(r.msisdn, '975020473'); // country code stripped
});

test('barred subscriber cannot pay', async () => {
  const s = svc(async () => kycResp({ ...OK, is_barred: true }));
  const r = await s.validatePayer('975020473');
  assert.equal(r.canPay, false);
  assert.ok(r.reasons.includes('BARRED'));
});

test('no PIN set cannot pay', async () => {
  const s = svc(async () => kycResp({ ...OK, is_pin_set: false }));
  const r = await s.validatePayer('975020473');
  assert.equal(r.canPay, false);
  assert.ok(r.reasons.includes('PIN_NOT_SET'));
});

test('unregistered cannot pay', async () => {
  const s = svc(async () => kycResp({ ...OK, registration: { status: 'UNREGISTERED' } }));
  const r = await s.validatePayer('975020473');
  assert.equal(r.canPay, false);
  assert.equal(r.registered, false);
  assert.ok(r.reasons.includes('NOT_REGISTERED'));
});

test('multiple problems are all reported', async () => {
  const s = svc(async () => kycResp({ is_barred: true, is_pin_set: false, registration: { status: 'UNREGISTERED' } }));
  const r = await s.validatePayer('975020473');
  assert.equal(r.canPay, false);
  assert.deepEqual(r.reasons.sort(), ['BARRED', 'NOT_REGISTERED', 'PIN_NOT_SET']);
});

test('lookup failure is advisory: canPay=false, LOOKUP_FAILED, no name leaked', async () => {
  const s = svc(async () => { throw new Error('boom'); });
  const r = await s.validatePayer('975020473');
  assert.equal(r.canPay, false);
  assert.equal(r.name, null);
  assert.deepEqual(r.reasons, ['LOOKUP_FAILED']);
});

test('enquiry path uses the stripped 9-digit subscriber number', async () => {
  let path = '';
  const s = svc(async (p: string) => { path = p; return kycResp(OK); });
  await s.validatePayer('+260 97 502 0473');
  assert.equal(path, '/standard/v1/users/975020473');
});

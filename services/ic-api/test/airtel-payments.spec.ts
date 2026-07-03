import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AirtelPaymentsService, zmSubscriberMsisdn } from '../src/airtel/airtel-payments.service';
import { assertAttemptTransition } from '../src/airtel/airtel-attempt';
import { AirtelError } from '../src/airtel/airtel.errors';
import type { AirtelAttempt, AirtelAttemptStore, CreateAttemptInput, TransitionPatch } from '../src/airtel/airtel-attempts.store';
import type { AirtelResponse } from '../src/airtel/airtel.client';

const CFG = () => ({ env: 'STAGING' as const, baseUrl: 'https://x', clientId: 'i', clientSecret: 's', publicKeyBase64: '', disbursePin: '' });
const GLOBAL = () => ({ enabled: true, country: 'ZM', currency: 'ZMW', balanceEnabled: false, httpTimeoutMs: 15000 });

class FakeStore implements AirtelAttemptStore {
  private readonly rows = new Map<string, AirtelAttempt>();
  private seq = 0;
  async create(input: CreateAttemptInput): Promise<AirtelAttempt> {
    const id = `a${++this.seq}`;
    const row: AirtelAttempt = {
      id, transactionId: input.transactionId, direction: input.direction, airtelEnv: input.airtelEnv,
      msisdn: input.msisdn, amountNgwee: input.amountNgwee, airtelTxnId: input.airtelTxnId,
      attemptNo: input.attemptNo, state: 'CREATED', airtelMoneyId: null, resultCode: null,
      requestId: null, failureReason: null,
    };
    this.rows.set(id, row);
    return { ...row };
  }
  async transition(attemptId: string, patch: TransitionPatch): Promise<AirtelAttempt> {
    const row = this.rows.get(attemptId);
    if (!row) throw new Error('not found');
    assertAttemptTransition(row.state, patch.to);
    row.state = patch.to;
    if (patch.airtelMoneyId != null) row.airtelMoneyId = patch.airtelMoneyId;
    if (patch.failureReason != null) row.failureReason = patch.failureReason;
    if (patch.resultCode != null) row.resultCode = patch.resultCode;
    if (patch.requestId != null) row.requestId = patch.requestId;
    return { ...row };
  }
  async findByAirtelTxnId(id: string): Promise<AirtelAttempt | null> {
    for (const r of this.rows.values()) if (r.airtelTxnId === id) return { ...r };
    return null;
  }
  async latestAttemptNo(txnId: string): Promise<number> {
    let m = 0;
    for (const r of this.rows.values()) if (r.transactionId === txnId) m = Math.max(m, r.attemptNo);
    return m;
  }
}

function resp(body: unknown): AirtelResponse {
  return { httpStatus: 200, body, requestId: 'req-1', resultCode: 'DP00800001006' };
}
function txnBody(status: string, moneyId?: string): unknown {
  return { data: { transaction: { status, airtel_money_id: moneyId } }, status: { code: '200', message: 'ok' } };
}

const TXN = '3f9a1c2d-1111-2222-3333-444455556666';

function svc(http: { post?: unknown; get?: unknown }, store = new FakeStore()) {
  const h = {
    post: (http.post ?? (async () => resp(txnBody('TIP')))) as never,
    get: (http.get ?? (async () => resp(txnBody('TIP')))) as never,
  };
  return { s: new AirtelPaymentsService(h as never, store, CFG, GLOBAL), store };
}

test('zmSubscriberMsisdn strips country code / leading zero / formatting', () => {
  assert.equal(zmSubscriberMsisdn('260975020473'), '975020473');
  assert.equal(zmSubscriberMsisdn('+260 97 502 0473'), '975020473');
  assert.equal(zmSubscriberMsisdn('0975020473'), '975020473');
  assert.equal(zmSubscriberMsisdn('975020473'), '975020473');
});

test('initiateCollection: interim status -> PENDING, not yet resolvable', async () => {
  let posted: { transaction?: { amount?: number; id?: string }; subscriber?: { msisdn?: string } } = {};
  const { s } = svc({ post: async (_p: string, b: unknown) => { posted = b as typeof posted; return resp(txnBody('TIP')); } });
  const o = await s.initiateCollection({ transactionId: TXN, msisdn: '260975020473', amountNgwee: 150n, reference: 'INV-1' });
  assert.equal(o.state, 'PENDING');
  assert.equal(s.toProcessorResult(o), null);
  assert.equal(posted.transaction?.amount, 1.5); // 150 ngwee -> K1.50
  assert.equal(posted.transaction?.id, 'INS-3F9A1C2D11112222-A01');
  assert.equal(posted.subscriber?.msisdn, '975020473');
});

test('initiateCollection: immediate TS -> SUCCESS with airtel_money_id', async () => {
  const { s } = svc({ post: async () => resp(txnBody('TS', 'MP260702.2347.B23113')) });
  const o = await s.initiateCollection({ transactionId: TXN, msisdn: '975020473', amountNgwee: 100n, reference: 'INV-2' });
  assert.equal(o.state, 'SUCCESS');
  assert.deepEqual(s.toProcessorResult(o), { status: 'SUCCESS', reference: 'MP260702.2347.B23113' });
});

test('initiateCollection: TF -> FAILED', async () => {
  const { s } = svc({ post: async () => resp(txnBody('TF')) });
  const o = await s.initiateCollection({ transactionId: TXN, msisdn: '975020473', amountNgwee: 100n, reference: 'INV-3' });
  assert.equal(o.state, 'FAILED');
  assert.equal(s.toProcessorResult(o)?.status, 'FAILED');
});

test('initiateCollection: timeout -> UNKNOWN (never assumed failed)', async () => {
  const { s } = svc({ post: async () => { throw new AirtelError('TIMEOUT', 'timed out'); } });
  const o = await s.initiateCollection({ transactionId: TXN, msisdn: '975020473', amountNgwee: 100n, reference: 'INV-4' });
  assert.equal(o.state, 'UNKNOWN');
  assert.equal(s.toProcessorResult(o), null);
});

test('initiateCollection: hard error (IP not allowed) -> FAILED', async () => {
  const { s } = svc({ post: async () => { throw new AirtelError('IP_NOT_ALLOWED', 'IP address not allowed: 1.2.3.4'); } });
  const o = await s.initiateCollection({ transactionId: TXN, msisdn: '975020473', amountNgwee: 100n, reference: 'INV-5' });
  assert.equal(o.state, 'FAILED');
  assert.equal(o.failureReason, 'IP_NOT_ALLOWED');
});

test('enquire: PENDING attempt resolves to SUCCESS on TS', async () => {
  const store = new FakeStore();
  const { s } = svc({ post: async () => resp(txnBody('TIP')), get: async () => resp(txnBody('TS', 'MP-XYZ')) }, store);
  const init = await s.initiateCollection({ transactionId: TXN, msisdn: '975020473', amountNgwee: 100n, reference: 'INV-6' });
  assert.equal(init.state, 'PENDING');
  const resolved = await s.enquire(init.airtelTxnId);
  assert.equal(resolved.state, 'SUCCESS');
  assert.equal(resolved.airtelMoneyId, 'MP-XYZ');
});

test('enquire is idempotent once final (no HTTP call)', async () => {
  const store = new FakeStore();
  let gets = 0;
  const { s } = svc({ post: async () => resp(txnBody('TS', 'MP-1')), get: async () => { gets++; return resp(txnBody('TS')); } }, store);
  const init = await s.initiateCollection({ transactionId: TXN, msisdn: '975020473', amountNgwee: 100n, reference: 'INV-7' });
  assert.equal(init.state, 'SUCCESS');
  const again = await s.enquire(init.airtelTxnId);
  assert.equal(again.state, 'SUCCESS');
  assert.equal(gets, 0); // already final — did not hit Airtel
});

test('second attempt for the same txn increments the attempt number', async () => {
  const store = new FakeStore();
  const { s } = svc({ post: async () => resp(txnBody('TF')) }, store);
  const a1 = await s.initiateCollection({ transactionId: TXN, msisdn: '975020473', amountNgwee: 100n, reference: 'INV-8' });
  const a2 = await s.initiateCollection({ transactionId: TXN, msisdn: '975020473', amountNgwee: 100n, reference: 'INV-8' });
  assert.equal(a1.airtelTxnId, 'INS-3F9A1C2D11112222-A01');
  assert.equal(a2.airtelTxnId, 'INS-3F9A1C2D11112222-A02');
});

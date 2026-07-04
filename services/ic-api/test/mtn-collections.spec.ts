import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MtnCollectionsService } from '../src/mtn/mtn-collections.service';
import { assertAttemptTransition } from '../src/mtn/mtn-attempt';
import { MtnError } from '../src/mtn/mtn.errors';
import type { MtnAttempt, MtnAttemptStore, CreateAttemptInput, TransitionPatch } from '../src/mtn/mtn-attempts.store';
import type { MtnResponse } from '../src/mtn/mtn.client';

const CFG = () => ({ product: 'COLLECTION' as const, env: 'PRODUCTION' as const, baseUrl: 'https://x', subscriptionKey: 's', apiUser: 'u', apiKey: 'k', tokenPath: '/collection/token/' });
const GLOBAL = () => ({ enabled: true, targetEnvironment: 'mtnzambia', currency: 'ZMW', httpTimeoutMs: 15000 });

class FakeStore implements MtnAttemptStore {
  private readonly rows = new Map<string, MtnAttempt>();
  private seq = 0;
  async create(input: CreateAttemptInput): Promise<MtnAttempt> {
    const id = `a${++this.seq}`;
    const row: MtnAttempt = { id, transactionId: input.transactionId, direction: input.direction, mtnEnv: input.mtnEnv, msisdn: input.msisdn, amountNgwee: input.amountNgwee, mtnRefId: input.mtnRefId, externalId: input.externalId, attemptNo: input.attemptNo, state: 'CREATED', financialTransactionId: null, reason: null };
    this.rows.set(id, row);
    return { ...row };
  }
  async transition(attemptId: string, patch: TransitionPatch): Promise<MtnAttempt> {
    const row = this.rows.get(attemptId)!;
    assertAttemptTransition(row.state, patch.to);
    row.state = patch.to;
    if (patch.financialTransactionId != null) row.financialTransactionId = patch.financialTransactionId;
    if (patch.reason != null) row.reason = patch.reason;
    return { ...row };
  }
  async findByRefId(refId: string): Promise<MtnAttempt | null> {
    for (const r of this.rows.values()) if (r.mtnRefId === refId) return { ...r };
    return null;
  }
  async latestAttemptNo(): Promise<number> { return 0; }
}

const accepted = (): MtnResponse => ({ httpStatus: 202, body: {} });
function statusResp(status: string, financialTransactionId?: string, reason?: string): MtnResponse {
  return { httpStatus: 200, body: { status, financialTransactionId, reason } };
}
const TXN = '3f9a1c2d-1111-2222-3333-444455556666';

function svc(http: { post?: unknown; get?: unknown }, store = new FakeStore()) {
  const h = {
    post: (http.post ?? (async () => accepted())) as never,
    get: (http.get ?? (async () => statusResp('PENDING'))) as never,
  };
  return { s: new MtnCollectionsService(h as never, store, CFG, GLOBAL), store };
}

test('initiateCollection: 202 -> PENDING, sends correct body', async () => {
  let posted: { body?: { amount?: string; currency?: string; payer?: { partyId?: string } }; referenceId?: string } = {};
  const { s } = svc({ post: async (_p: string, opts: unknown) => { posted = opts as typeof posted; return accepted(); } });
  const o = await s.initiateCollection({ transactionId: TXN, msisdn: '260960000000', amountNgwee: 150n, externalId: 'INV1' });
  assert.equal(o.state, 'PENDING');
  assert.equal(s.toProcessorResult(o), null);
  assert.equal(posted.body?.amount, '1.50');
  assert.equal(posted.body?.currency, 'ZMW');
  assert.equal(posted.body?.payer?.partyId, '260960000000');
  assert.ok(posted.referenceId && posted.referenceId.length >= 32); // UUID X-Reference-Id
});

test('status: SUCCESSFUL -> SUCCESS with financialTransactionId', async () => {
  const store = new FakeStore();
  const { s } = svc({ post: async () => accepted(), get: async () => statusResp('SUCCESSFUL', 'FIN123') }, store);
  const init = await s.initiateCollection({ transactionId: TXN, msisdn: '260960000000', amountNgwee: 100n, externalId: 'INV2' });
  const done = await s.status(init.mtnRefId);
  assert.equal(done.state, 'SUCCESS');
  assert.deepEqual(s.toProcessorResult(done), { status: 'SUCCESS', reference: 'FIN123' });
});

test('status: FAILED carries the reason', async () => {
  const store = new FakeStore();
  const { s } = svc({ post: async () => accepted(), get: async () => statusResp('FAILED', undefined, 'PAYER_NOT_FOUND') }, store);
  const init = await s.initiateCollection({ transactionId: TXN, msisdn: '260960000000', amountNgwee: 100n, externalId: 'INV3' });
  const done = await s.status(init.mtnRefId);
  assert.equal(done.state, 'FAILED');
  assert.equal(done.reason, 'PAYER_NOT_FOUND');
});

test('initiate timeout -> UNKNOWN (never assumed failed)', async () => {
  const { s } = svc({ post: async () => { throw new MtnError('TIMEOUT', 'timed out'); } });
  const o = await s.initiateCollection({ transactionId: TXN, msisdn: '260960000000', amountNgwee: 100n, externalId: 'INV4' });
  assert.equal(o.state, 'UNKNOWN');
});

test('status is idempotent once final (no HTTP call)', async () => {
  const store = new FakeStore();
  let gets = 0;
  const { s } = svc({ post: async () => accepted(), get: async () => { gets++; return statusResp('SUCCESSFUL', 'F'); } }, store);
  const init = await s.initiateCollection({ transactionId: TXN, msisdn: '260960000000', amountNgwee: 100n, externalId: 'INV5' });
  await s.status(init.mtnRefId); // resolves to SUCCESS
  gets = 0;
  const again = await s.status(init.mtnRefId);
  assert.equal(again.state, 'SUCCESS');
  assert.equal(gets, 0);
});

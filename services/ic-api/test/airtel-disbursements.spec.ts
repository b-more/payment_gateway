import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { AirtelDisbursementsService } from '../src/airtel/airtel-disbursements.service';
import { assertAttemptTransition } from '../src/airtel/airtel-attempt';
import { AirtelError } from '../src/airtel/airtel.errors';
import { pkcs1Decrypt } from './airtel-pkcs1-decrypt';
import type { AirtelAttempt, AirtelAttemptStore, CreateAttemptInput, TransitionPatch } from '../src/airtel/airtel-attempts.store';
import type { AirtelResponse } from '../src/airtel/airtel.client';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 1024,
  publicKeyEncoding: { type: 'spki', format: 'der' },
  privateKeyEncoding: { type: 'pkcs8', format: 'der' },
});
const PUB_B64 = (publicKey as Buffer).toString('base64');
const PRIV_B64 = (privateKey as Buffer).toString('base64');
const decryptPin = (b64: string): string => pkcs1Decrypt(b64, PRIV_B64);

const CFG = () => ({ env: 'STAGING' as const, baseUrl: 'https://x', clientId: 'i', clientSecret: 's', publicKeyBase64: PUB_B64, disbursePin: '1234' });

class FakeStore implements AirtelAttemptStore {
  private readonly rows = new Map<string, AirtelAttempt>();
  private seq = 0;
  async create(input: CreateAttemptInput): Promise<AirtelAttempt> {
    const id = `a${++this.seq}`;
    const row: AirtelAttempt = { id, transactionId: input.transactionId, direction: input.direction, airtelEnv: input.airtelEnv, msisdn: input.msisdn, amountNgwee: input.amountNgwee, airtelTxnId: input.airtelTxnId, attemptNo: input.attemptNo, state: 'CREATED', airtelMoneyId: null, resultCode: null, requestId: null, failureReason: null };
    this.rows.set(id, row);
    return { ...row };
  }
  async transition(attemptId: string, patch: TransitionPatch): Promise<AirtelAttempt> {
    const row = this.rows.get(attemptId)!;
    assertAttemptTransition(row.state, patch.to);
    row.state = patch.to;
    if (patch.airtelMoneyId != null) row.airtelMoneyId = patch.airtelMoneyId;
    if (patch.failureReason != null) row.failureReason = patch.failureReason;
    return { ...row };
  }
  async findByAirtelTxnId(id: string): Promise<AirtelAttempt | null> {
    for (const r of this.rows.values()) if (r.airtelTxnId === id) return { ...r };
    return null;
  }
  async latestAttemptNo(txnId: string): Promise<number> {
    let m = 0; for (const r of this.rows.values()) if (r.transactionId === txnId) m = Math.max(m, r.attemptNo); return m;
  }
}

function resp(status: string, moneyId?: string): AirtelResponse {
  return { httpStatus: 200, body: { data: { transaction: { status, airtel_money_id: moneyId, id: '001' } }, status: { code: '200' } }, requestId: 'req-1', resultCode: 'DP00800001001' };
}
const TXN = '3f9a1c2d-1111-2222-3333-444455556666';

test('disbursement refuses to dispatch without an approvalRef', async () => {
  let posted = false;
  const http = { post: async () => { posted = true; return resp('TS'); }, get: async () => resp('TS') };
  const s = new AirtelDisbursementsService(http as never, new FakeStore(), CFG);
  await assert.rejects(
    () => s.initiateDisbursement({ transactionId: TXN, payeeMsisdn: '975020473', amountNgwee: 500n, reference: 'PAY-1', approvalRef: '' }),
    /approvalRef/,
  );
  assert.equal(posted, false); // never hit Airtel
});

test('disbursement encrypts the PIN and sends a B2C body', async () => {
  let body: { pin?: string; payee?: { msisdn?: string; wallet_type?: string }; transaction?: { amount?: number; id?: string; type?: string } } = {};
  const http = { post: async (_p: string, b: unknown) => { body = b as typeof body; return resp('TS', 'MP-D-1'); }, get: async () => resp('TS') };
  const s = new AirtelDisbursementsService(http as never, new FakeStore(), CFG);
  const o = await s.initiateDisbursement({ transactionId: TXN, payeeMsisdn: '260975020473', amountNgwee: 500n, reference: 'PAY-2', approvalRef: 'APPR-9' });

  assert.equal(o.state, 'SUCCESS');
  assert.deepEqual(s.toProcessorResult(o), { status: 'SUCCESS', reference: 'MP-D-1' });
  assert.equal(body.transaction?.type, 'B2C');
  assert.equal(body.transaction?.amount, 5); // 500 ngwee -> K5.00
  assert.equal(body.payee?.msisdn, '975020473');
  assert.equal(body.payee?.wallet_type, 'NORMAL');
  assert.equal(decryptPin(body.pin!), '1234'); // PIN encrypted with Airtel's key
});

test('disbursement timeout -> UNKNOWN (money may have moved)', async () => {
  const http = { post: async () => { throw new AirtelError('TIMEOUT', 'timed out'); }, get: async () => resp('TS') };
  const s = new AirtelDisbursementsService(http as never, new FakeStore(), CFG);
  const o = await s.initiateDisbursement({ transactionId: TXN, payeeMsisdn: '975020473', amountNgwee: 500n, reference: 'PAY-3', approvalRef: 'APPR-1' });
  assert.equal(o.state, 'UNKNOWN');
  assert.equal(s.toProcessorResult(o), null);
});

test('disbursement enquiry resolves a PENDING payout', async () => {
  const store = new FakeStore();
  const http = { post: async () => resp('TIP'), get: async () => resp('TS', 'MP-D-2') };
  const s = new AirtelDisbursementsService(http as never, store, CFG);
  const init = await s.initiateDisbursement({ transactionId: TXN, payeeMsisdn: '975020473', amountNgwee: 500n, reference: 'PAY-4', approvalRef: 'APPR-2' });
  assert.equal(init.state, 'PENDING');
  const done = await s.enquireDisbursement(init.airtelTxnId);
  assert.equal(done.state, 'SUCCESS');
  assert.equal(done.airtelMoneyId, 'MP-D-2');
});

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool } from '../src/database/database.module';
import { LedgerService } from '../src/ledger/ledger.service';
import { AuditService } from '../src/audit/audit.service';
import { ProcessorService } from '../src/processors/processor.service';
import { FloatService } from '../src/float/float.service';
import { TransactionService } from '../src/transactions/transaction.service';
import { InsufficientFloatError, DualControlError, IllegalTransitionError, AccountNotLiveError } from '../src/money/errors';
import type { Processor } from '../src/money/types';
import type { WebhookService } from '../src/webhooks/webhook.service';

// Integration tests for the §5 money engine. Requires DATABASE_URL pointing at a
// migrated database (run migrations 0001-0004 first).

const pool = createPool(process.env.DATABASE_URL);
const ledger = new LedgerService();
const audit = new AuditService();
const processor = new ProcessorService();
// Webhook enqueue is out of scope here; stub it (covered by webhook.itest.ts).
const webhooks = { enqueue: async (): Promise<void> => undefined } as unknown as WebhookService;
const txns = new TransactionService(pool, ledger, audit, processor, webhooks);
const floatSvc = (threshold: bigint): FloatService =>
  new FloatService(pool, ledger, audit, { dualControlThreshold: threshold });

// Every float credit requires a proof of payment (FLOAT-3); a tiny valid PDF.
const PROOF = {
  fileName: 'slip.pdf',
  contentType: 'application/pdf',
  dataBase64: Buffer.from('%PDF-1.4 test proof').toString('base64'),
};

after(async () => {
  await pool.end();
});

async function seedAccount(mode: 'SANDBOX' | 'PRODUCTION' = 'SANDBOX'): Promise<string> {
  const m = await pool.query<{ id: string }>(
    "INSERT INTO merchants (name, merchant_type, email) VALUES ('T', 'PRIVATE', 't@t.zm') RETURNING id",
  );
  const a = await pool.query<{ id: string }>(
    "INSERT INTO accounts (merchant_id, account_type, operating_mode) VALUES ($1, 'COLLECTION', $2) RETURNING id",
    [m.rows[0].id, mode],
  );
  return a.rows[0].id;
}

async function setCharge(
  accountId: string,
  proc: Processor,
  type: 'FIXED' | 'PERCENTAGE' | 'TIERED',
  fulfiller: 'SOURCE' | 'MERCHANT',
  fixed: bigint | null,
  percent: string | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO charge_configs (account_id, processor, charge_fulfiller, charge_type, fixed_value, percent_value)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [accountId, proc, fulfiller, type, fixed === null ? null : fixed.toString(), percent],
  );
}

async function balanceOf(accountId: string): Promise<bigint> {
  const r = await pool.query<{ float_balance: string }>(
    'SELECT float_balance FROM accounts WHERE id = $1',
    [accountId],
  );
  return BigInt(r.rows[0].float_balance);
}

const HIGH = 1_000_000_000n; // threshold high enough to post credits directly

test('collection: needs no float, CREDITS the merchant net on SUCCESS (TXN/CHG-2)', async () => {
  const accountId = await seedAccount('PRODUCTION');
  await setCharge(accountId, 'MTN', 'PERCENTAGE', 'SOURCE', null, '2.50');
  // Deliberately NO float: collecting is how a merchant earns it.

  const txn = await txns.processTransaction({
    accountId,
    type: 'COLLECTION',
    processor: 'MTN',
    amount: 100_000n,
    msisdn: '260970000001',
    idempotencyKey: 'k-success',
    environment: 'PRODUCTION',
  });

  assert.equal(txn.status, 'PROCESSING');
  assert.equal(txn.charge, 2_500n); // 2.50% of 100000
  assert.equal(txn.netAmount, 100_000n); // SOURCE -> merchant nets full amount
  assert.equal(await balanceOf(accountId), 0n); // nothing debited to collect

  const result = await processor.dispatch('SANDBOX', 'MTN', {
    msisdn: '260970000001',
    amount: 100_000n,
    reference: txn.id,
  });
  const done = await txns.completeTransaction({ transactionId: txn.id, result });
  assert.equal(done.status, 'SUCCESS');
  assert.equal(await balanceOf(accountId), 100_000n); // credited the net on success
});

test('collection: a FAILED collection moves no float', async () => {
  const accountId = await seedAccount('PRODUCTION');
  await setCharge(accountId, 'MTN', 'FIXED', 'SOURCE', 500n, null);

  const txn = await txns.processTransaction({
    accountId, type: 'COLLECTION', processor: 'MTN', amount: 100_000n,
    msisdn: '260970000001', idempotencyKey: 'k-failcol', environment: 'PRODUCTION',
  });
  await txns.completeTransaction({
    transactionId: txn.id,
    result: { status: 'FAILED', failureReason: 'PROCESSOR_DECLINED', reference: 'test-decline' },
  });
  assert.equal(await balanceOf(accountId), 0n); // never credited, nothing to refund
});

test('disbursement: DEBITS float up front; insufficient float -> FAILED, no debit (TXN-2)', async () => {
  const accountId = await seedAccount('PRODUCTION');
  await setCharge(accountId, 'MTN', 'FIXED', 'SOURCE', 500n, null);
  await floatSvc(HIGH).creditFloat({ accountId, amount: 1_000n, actorId: randomUUID(), proof: PROOF });

  // Payouts spend float — this one can't be covered.
  const poor = await txns.processTransaction({
    accountId, type: 'DISBURSEMENT', processor: 'MTN', amount: 100_000n,
    msisdn: '260970000001', idempotencyKey: 'k-poor', environment: 'PRODUCTION',
  });
  assert.equal(poor.status, 'FAILED');
  assert.equal(poor.failureReason, 'INSUFFICIENT_FLOAT');
  assert.equal(await balanceOf(accountId), 1_000n); // untouched

  // An affordable payout reserves amount + charge immediately.
  await floatSvc(HIGH).creditFloat({ accountId, amount: 99_000n, actorId: randomUUID(), proof: PROOF });
  const ok = await txns.processTransaction({
    accountId, type: 'DISBURSEMENT', processor: 'MTN', amount: 50_000n,
    msisdn: '260970000001', idempotencyKey: 'k-payout', environment: 'PRODUCTION',
  });
  assert.equal(ok.status, 'PROCESSING');
  assert.equal(await balanceOf(accountId), 49_500n); // 100_000 - (50_000 + 500)
});

test('idempotency: repeated key returns original, credits once (IDEM-2)', async () => {
  const accountId = await seedAccount('PRODUCTION');
  await setCharge(accountId, 'MTN', 'FIXED', 'SOURCE', 0n, null);

  const first = await txns.processTransaction({
    accountId, type: 'COLLECTION', processor: 'MTN', amount: 50_000n,
    msisdn: '260970000001', idempotencyKey: 'idem-1', environment: 'PRODUCTION',
  });
  const second = await txns.processTransaction({
    accountId, type: 'COLLECTION', processor: 'MTN', amount: 50_000n,
    msisdn: '260970000001', idempotencyKey: 'idem-1', environment: 'PRODUCTION',
  });
  assert.equal(first.id, second.id);

  const result = await processor.dispatch('SANDBOX', 'MTN', { msisdn: '260970000001', amount: 50_000n, reference: first.id });
  await txns.completeTransaction({ transactionId: first.id, result });
  // Completing twice must not credit twice (idempotent completion).
  await txns.completeTransaction({ transactionId: first.id, result });
  assert.equal(await balanceOf(accountId), 50_000n); // credited exactly once
});

test('dual control: large credit parked, requires a distinct approver (FLOAT-3/SEC-Z4)', async () => {
  const accountId = await seedAccount();
  const svc = floatSvc(100_000n); // threshold
  const requester = randomUUID();

  const parked = await svc.creditFloat({ accountId, amount: 200_000n, actorId: requester, proof: PROOF });
  assert.equal(parked.posted, false);
  assert.equal(await balanceOf(accountId), 0n); // not posted yet
  const requestId = parked.posted === false ? parked.requestId : '';

  await assert.rejects(
    svc.approveFloatCredit({ requestId, approverId: requester }),
    DualControlError,
  );

  const approved = await svc.approveFloatCredit({ requestId, approverId: randomUUID() });
  assert.equal(approved.balanceAfter, 200_000n);
  assert.equal(await balanceOf(accountId), 200_000n);

  // below-threshold credit posts immediately
  const direct = await svc.creditFloat({ accountId, amount: 50_000n, actorId: randomUUID(), proof: PROOF });
  assert.equal(direct.posted, true);
  assert.equal(await balanceOf(accountId), 250_000n);
});

test('reversal: a reversed COLLECTION takes back the credited net; second reverse rejected (STATE-3)', async () => {
  const accountId = await seedAccount('PRODUCTION');
  await setCharge(accountId, 'MTN', 'FIXED', 'SOURCE', 500n, null);

  const txn = await txns.processTransaction({
    accountId, type: 'COLLECTION', processor: 'MTN', amount: 100_000n,
    msisdn: '260970000001', idempotencyKey: 'k-rev', environment: 'PRODUCTION',
  });
  const result = await processor.dispatch('SANDBOX', 'MTN', { msisdn: '260970000001', amount: 100_000n, reference: txn.id });
  await txns.completeTransaction({ transactionId: txn.id, result });
  assert.equal(await balanceOf(accountId), 100_000n); // earned

  // Refunding the customer must take the money back off the merchant.
  const reversed = await txns.reverseTransaction({ transactionId: txn.id, accountId, actorId: randomUUID() });
  assert.equal(reversed.status, 'REVERSED');
  assert.equal(await balanceOf(accountId), 0n);

  await assert.rejects(
    txns.reverseTransaction({ transactionId: txn.id, accountId, actorId: randomUUID() }),
    IllegalTransitionError,
  );
});

test('processor decline refunds a DISBURSEMENT’s reserved float (PROCESSING -> FAILED)', async () => {
  const accountId = await seedAccount('PRODUCTION');
  await setCharge(accountId, 'MTN', 'FIXED', 'SOURCE', 500n, null);
  await floatSvc(HIGH).creditFloat({ accountId, amount: 1_000_000n, actorId: randomUUID(), proof: PROOF });

  const txn = await txns.processTransaction({
    accountId, type: 'DISBURSEMENT', processor: 'MTN', amount: 100_000n,
    msisdn: '260971230000', idempotencyKey: 'k-decline', environment: 'PRODUCTION', // MSISDN ends 0000 -> decline
  });
  assert.equal(txn.status, 'PROCESSING');
  assert.equal(await balanceOf(accountId), 899_500n); // reserved up front

  const result = await processor.dispatch('SANDBOX', 'MTN', { msisdn: '260971230000', amount: 100_000n, reference: txn.id });
  assert.equal(result.status, 'FAILED');
  const done = await txns.completeTransaction({ transactionId: txn.id, result });
  assert.equal(done.status, 'FAILED');
  assert.equal(await balanceOf(accountId), 1_000_000n); // refunded
});

test('SANDBOX is isolated from production float in both directions', async () => {
  const accountId = await seedAccount('SANDBOX');
  await setCharge(accountId, 'MTN', 'FIXED', 'SOURCE', 500n, null);

  const collected = await txns.processAndSettle({
    accountId, type: 'COLLECTION', processor: 'MTN', amount: 100_000n,
    msisdn: '260970000001', idempotencyKey: 'sbx-col', environment: 'SANDBOX',
  });
  assert.equal(collected.status, 'SUCCESS'); // sandbox settles so integrators can test
  assert.equal(await balanceOf(accountId), 0n); // but never credits real float

  const paid = await txns.processAndSettle({
    accountId, type: 'DISBURSEMENT', processor: 'MTN', amount: 100_000n,
    msisdn: '260970000001', idempotencyKey: 'sbx-pay', environment: 'SANDBOX',
  });
  assert.equal(paid.status, 'SUCCESS'); // and needs no float to run
  assert.equal(await balanceOf(accountId), 0n);
});

test('TXN-6: PRODUCTION transaction on a SANDBOX account is rejected', async () => {
  const accountId = await seedAccount();
  await setCharge(accountId, 'MTN', 'FIXED', 'SOURCE', 0n, null);
  await floatSvc(HIGH).creditFloat({ accountId, amount: 1_000_000n, actorId: randomUUID(), proof: PROOF });

  await assert.rejects(
    txns.processTransaction({
      accountId, type: 'COLLECTION', processor: 'MTN', amount: 1_000n,
      msisdn: '260970000001', idempotencyKey: 'k-prod', environment: 'PRODUCTION',
    }),
    AccountNotLiveError,
  );
});

test('TXN-1/SEC-M3: row lock serializes concurrent spends — no double spend', async () => {
  const accountId = await seedAccount('PRODUCTION');
  await setCharge(accountId, 'MTN', 'FIXED', 'SOURCE', 0n, null);
  await floatSvc(HIGH).creditFloat({ accountId, amount: 100_000n, actorId: randomUUID(), proof: PROOF });

  // Payouts are what spend float — race two for the whole balance, distinct
  // keys (so idempotency doesn't dedupe them).
  const [a, b] = await Promise.all([
    txns.processTransaction({
      accountId, type: 'DISBURSEMENT', processor: 'MTN', amount: 100_000n,
      msisdn: '260970000001', idempotencyKey: 'cc-a', environment: 'PRODUCTION',
    }),
    txns.processTransaction({
      accountId, type: 'DISBURSEMENT', processor: 'MTN', amount: 100_000n,
      msisdn: '260970000001', idempotencyKey: 'cc-b', environment: 'PRODUCTION',
    }),
  ]);

  // Exactly one is covered; the other is rejected for insufficient float.
  assert.deepEqual([a.status, b.status].sort(), ['FAILED', 'PROCESSING']);
  assert.equal(await balanceOf(accountId), 0n); // debited once, never negative
});

test('ledger never double-spends under insufficient balance (direct DEBIT guard)', async () => {
  const accountId = await seedAccount();
  await floatSvc(HIGH).creditFloat({ accountId, amount: 100n, actorId: randomUUID(), proof: PROOF });
  await assert.rejects(
    pool.connect().then(async (c) => {
      try {
        await c.query('BEGIN');
        await ledger.append(c, { accountId, entryType: 'DEBIT', amount: 200n });
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    }),
    InsufficientFloatError,
  );
});

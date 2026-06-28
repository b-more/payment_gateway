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

after(async () => {
  await pool.end();
});

async function seedAccount(): Promise<string> {
  const m = await pool.query<{ id: string }>(
    "INSERT INTO merchants (name, merchant_type, email) VALUES ('T', 'PRIVATE', 't@t.zm') RETURNING id",
  );
  const a = await pool.query<{ id: string }>(
    "INSERT INTO accounts (merchant_id, account_type) VALUES ($1, 'COLLECTION') RETURNING id",
    [m.rows[0].id],
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

test('collection: charge computed, float debited, PROCESSING then SUCCESS (TXN/CHG-2)', async () => {
  const accountId = await seedAccount();
  await setCharge(accountId, 'MTN', 'PERCENTAGE', 'SOURCE', null, '2.50');
  await floatSvc(HIGH).creditFloat({ accountId, amount: 1_000_000n, actorId: randomUUID() });

  const txn = await txns.processTransaction({
    accountId,
    type: 'COLLECTION',
    processor: 'MTN',
    amount: 100_000n,
    msisdn: '260970000001',
    idempotencyKey: 'k-success',
    environment: 'SANDBOX',
  });

  assert.equal(txn.status, 'PROCESSING');
  assert.equal(txn.charge, 2_500n); // 2.50% of 100000
  assert.equal(txn.netAmount, 100_000n); // SOURCE -> merchant nets full amount
  assert.equal(await balanceOf(accountId), 897_500n); // 1_000_000 - (100000 + 2500)

  const result = await processor.dispatch('SANDBOX', 'MTN', {
    msisdn: '260970000001',
    amount: 100_000n,
    reference: txn.id,
  });
  const done = await txns.completeTransaction({ transactionId: txn.id, result });
  assert.equal(done.status, 'SUCCESS');
  assert.equal(await balanceOf(accountId), 897_500n); // unchanged on success
});

test('insufficient float -> FAILED, no debit (TXN-2)', async () => {
  const accountId = await seedAccount();
  await setCharge(accountId, 'MTN', 'FIXED', 'SOURCE', 500n, null);
  await floatSvc(HIGH).creditFloat({ accountId, amount: 1_000n, actorId: randomUUID() });

  const txn = await txns.processTransaction({
    accountId,
    type: 'COLLECTION',
    processor: 'MTN',
    amount: 100_000n,
    msisdn: '260970000001',
    idempotencyKey: 'k-poor',
    environment: 'SANDBOX',
  });

  assert.equal(txn.status, 'FAILED');
  assert.equal(txn.failureReason, 'INSUFFICIENT_FLOAT');
  assert.equal(await balanceOf(accountId), 1_000n); // untouched
});

test('idempotency: repeated key returns original, debits once (IDEM-2)', async () => {
  const accountId = await seedAccount();
  await setCharge(accountId, 'MTN', 'FIXED', 'SOURCE', 0n, null);
  await floatSvc(HIGH).creditFloat({ accountId, amount: 1_000_000n, actorId: randomUUID() });

  const first = await txns.processTransaction({
    accountId, type: 'COLLECTION', processor: 'MTN', amount: 50_000n,
    msisdn: '260970000001', idempotencyKey: 'idem-1', environment: 'SANDBOX',
  });
  const second = await txns.processTransaction({
    accountId, type: 'COLLECTION', processor: 'MTN', amount: 50_000n,
    msisdn: '260970000001', idempotencyKey: 'idem-1', environment: 'SANDBOX',
  });

  assert.equal(first.id, second.id);
  assert.equal(await balanceOf(accountId), 950_000n); // debited exactly once
});

test('dual control: large credit parked, requires a distinct approver (FLOAT-3/SEC-Z4)', async () => {
  const accountId = await seedAccount();
  const svc = floatSvc(100_000n); // threshold
  const requester = randomUUID();

  const parked = await svc.creditFloat({ accountId, amount: 200_000n, actorId: requester });
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
  const direct = await svc.creditFloat({ accountId, amount: 50_000n, actorId: randomUUID() });
  assert.equal(direct.posted, true);
  assert.equal(await balanceOf(accountId), 250_000n);
});

test('reversal: SUCCESS -> REVERSED restores float; second reverse rejected (STATE-3)', async () => {
  const accountId = await seedAccount();
  await setCharge(accountId, 'MTN', 'FIXED', 'SOURCE', 500n, null);
  await floatSvc(HIGH).creditFloat({ accountId, amount: 1_000_000n, actorId: randomUUID() });

  const txn = await txns.processTransaction({
    accountId, type: 'COLLECTION', processor: 'MTN', amount: 100_000n,
    msisdn: '260970000001', idempotencyKey: 'k-rev', environment: 'SANDBOX',
  });
  const result = await processor.dispatch('SANDBOX', 'MTN', { msisdn: '260970000001', amount: 100_000n, reference: txn.id });
  await txns.completeTransaction({ transactionId: txn.id, result });
  assert.equal(await balanceOf(accountId), 899_500n);

  const reversed = await txns.reverseTransaction({ transactionId: txn.id, accountId, actorId: randomUUID() });
  assert.equal(reversed.status, 'REVERSED');
  assert.equal(await balanceOf(accountId), 1_000_000n); // fully restored

  await assert.rejects(
    txns.reverseTransaction({ transactionId: txn.id, accountId, actorId: randomUUID() }),
    IllegalTransitionError,
  );
});

test('processor decline refunds the debited float (PROCESSING -> FAILED)', async () => {
  const accountId = await seedAccount();
  await setCharge(accountId, 'MTN', 'FIXED', 'SOURCE', 500n, null);
  await floatSvc(HIGH).creditFloat({ accountId, amount: 1_000_000n, actorId: randomUUID() });

  const txn = await txns.processTransaction({
    accountId, type: 'COLLECTION', processor: 'MTN', amount: 100_000n,
    msisdn: '260971230000', idempotencyKey: 'k-decline', environment: 'SANDBOX', // MSISDN ends 0000 -> decline
  });
  assert.equal(txn.status, 'PROCESSING');
  assert.equal(await balanceOf(accountId), 899_500n);

  const result = await processor.dispatch('SANDBOX', 'MTN', { msisdn: '260971230000', amount: 100_000n, reference: txn.id });
  assert.equal(result.status, 'FAILED');
  const done = await txns.completeTransaction({ transactionId: txn.id, result });
  assert.equal(done.status, 'FAILED');
  assert.equal(await balanceOf(accountId), 1_000_000n); // refunded
});

test('TXN-6: PRODUCTION transaction on a SANDBOX account is rejected', async () => {
  const accountId = await seedAccount();
  await setCharge(accountId, 'MTN', 'FIXED', 'SOURCE', 0n, null);
  await floatSvc(HIGH).creditFloat({ accountId, amount: 1_000_000n, actorId: randomUUID() });

  await assert.rejects(
    txns.processTransaction({
      accountId, type: 'COLLECTION', processor: 'MTN', amount: 1_000n,
      msisdn: '260970000001', idempotencyKey: 'k-prod', environment: 'PRODUCTION',
    }),
    AccountNotLiveError,
  );
});

test('TXN-1/SEC-M3: row lock serializes concurrent spends — no double spend', async () => {
  const accountId = await seedAccount();
  await setCharge(accountId, 'MTN', 'FIXED', 'SOURCE', 0n, null);
  await floatSvc(HIGH).creditFloat({ accountId, amount: 100_000n, actorId: randomUUID() });

  // Two concurrent collections of the full balance, distinct keys (not deduped).
  const [a, b] = await Promise.all([
    txns.processTransaction({
      accountId, type: 'COLLECTION', processor: 'MTN', amount: 100_000n,
      msisdn: '260970000001', idempotencyKey: 'cc-a', environment: 'SANDBOX',
    }),
    txns.processTransaction({
      accountId, type: 'COLLECTION', processor: 'MTN', amount: 100_000n,
      msisdn: '260970000001', idempotencyKey: 'cc-b', environment: 'SANDBOX',
    }),
  ]);

  // Exactly one is covered; the other is rejected for insufficient float.
  assert.deepEqual([a.status, b.status].sort(), ['FAILED', 'PROCESSING']);
  assert.equal(await balanceOf(accountId), 0n); // debited once, never negative
});

test('ledger never double-spends under insufficient balance (direct DEBIT guard)', async () => {
  const accountId = await seedAccount();
  await floatSvc(HIGH).creditFloat({ accountId, amount: 100n, actorId: randomUUID() });
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

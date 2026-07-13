import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool } from '../src/database/database.module';
import { LedgerService } from '../src/ledger/ledger.service';
import { AuditService } from '../src/audit/audit.service';
import { ProcessorService } from '../src/processors/processor.service';
import { FloatService, type ProofOfPayment } from '../src/float/float.service';
import { TransactionService } from '../src/transactions/transaction.service';
import { SettlementService } from '../src/settlements/settlement.service';
import { ReconciliationService } from '../src/settlements/reconciliation.service';
import type { Processor } from '../src/money/types';
import type { WebhookService } from '../src/webhooks/webhook.service';

// ─────────────────────────────────────────────────────────────────────────────
// Money-path audit: collection → commission → settlement, end to end through the
// real engine. Requires DATABASE_URL pointing at a migrated database.
//
// Groups A verifies the commission math that IS correct (CHG-1..6). Groups B/C/D
// are CHARACTERIZATION tests: they pin the *current* behaviour of three audit
// findings so the suite is green today and fails loudly at the labelled line the
// moment a fix changes that behaviour. Each carries the finding it guards:
//
//   ① collection debits float AND settlement debits again — a collection (money
//     in) drives merchant float DOWN twice. Flagged in settlement.service.ts:36.
//   ② reverseTransaction has no guard against reversing an already-SETTLED
//     collection: it refunds float with no settlement clawback.
//   ③ reconciliation re-disputes internal terminal states every run and writes
//     duplicate reconciliation_items (no idempotency per (run, txn)).
// ─────────────────────────────────────────────────────────────────────────────

const pool = createPool(process.env.DATABASE_URL);
const ledger = new LedgerService();
const audit = new AuditService();
const processor = new ProcessorService();
// Webhook enqueue is out of scope here; stub it (covered by webhook.itest.ts).
const webhooks = { enqueue: async (): Promise<void> => undefined } as unknown as WebhookService;
const txns = new TransactionService(pool, ledger, audit, processor, webhooks);
const settlements = new SettlementService(pool, ledger, audit);
const reconciliation = new ReconciliationService(pool, audit);
const HIGH = 1_000_000_000n; // dual-control threshold high enough to post credits directly
const floats = new FloatService(pool, ledger, audit, { dualControlThreshold: HIGH });

after(async () => {
  await pool.end();
});

async function seedAccount(): Promise<string> {
  const m = await pool.query<{ id: string }>(
    "INSERT INTO merchants (name, merchant_type, email) VALUES ('A', 'PRIVATE', 'a@a.zm') RETURNING id",
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

// A valid maker proof-of-payment (FLOAT-3): non-empty, allowed content type.
const PROOF: ProofOfPayment = {
  fileName: 'slip.pdf',
  contentType: 'application/pdf',
  dataBase64: Buffer.from('%PDF-1.4 audit-test proof of payment').toString('base64'),
};

// Fund an account's float below the dual-control threshold (posts immediately).
async function fund(accountId: string, amount: bigint): Promise<void> {
  const res = await floats.creditFloat({ accountId, amount, actorId: randomUUID(), proof: PROOF });
  assert.equal(res.posted, true);
}

// A collection driven all the way to SUCCESS through the real engine + sandbox processor.
async function collectSuccess(
  accountId: string,
  amount: bigint,
  key: string,
): Promise<{ id: string; charge: bigint; netAmount: bigint }> {
  const txn = await txns.processTransaction({
    accountId,
    type: 'COLLECTION',
    processor: 'MTN',
    amount,
    msisdn: '260970000001', // does not end 0000 -> sandbox approves
    idempotencyKey: key,
    environment: 'SANDBOX',
  });
  assert.equal(txn.status, 'PROCESSING');
  const result = await processor.dispatch('SANDBOX', 'MTN', {
    msisdn: '260970000001',
    amount,
    reference: txn.id,
  });
  const done = await txns.completeTransaction({ transactionId: txn.id, result });
  assert.equal(done.status, 'SUCCESS');
  return { id: done.id, charge: done.charge, netAmount: done.netAmount };
}

// Insert a final transaction directly (mirrors settlement.itest.ts) to drive recon
// without standing up the whole engine path.
async function insertTxn(accountId: string, status: string, amount: bigint): Promise<string> {
  const t = await pool.query<{ id: string }>(
    `INSERT INTO transactions (account_id, type, processor, amount, net_amount, status, idempotency_key, environment)
     VALUES ($1,'COLLECTION','MTN',$2,$2,$3,$4,'SANDBOX') RETURNING id`,
    [accountId, amount.toString(), status, randomUUID()],
  );
  return t.rows[0].id;
}

// ── Group A: commission correctness (CHG-1..6) ──────────────────────────────

test('A1 SOURCE percentage: customer bears charge, merchant nets full amount (CHG-2/4)', async () => {
  const accountId = await seedAccount();
  await setCharge(accountId, 'MTN', 'PERCENTAGE', 'SOURCE', null, '2.50');
  await fund(accountId, 1_000_000n);

  const txn = await txns.processTransaction({
    accountId, type: 'COLLECTION', processor: 'MTN', amount: 100_000n,
    msisdn: '260970000001', idempotencyKey: 'A1', environment: 'SANDBOX',
  });

  assert.equal(txn.charge, 2_500n); // 2.50% of 100_000
  assert.equal(txn.netAmount, 100_000n); // SOURCE -> merchant nets the full amount
  assert.equal(await balanceOf(accountId), 897_500n); // debited required = amount + charge = 102_500
});

test('A2 MERCHANT percentage: merchant bears charge, nets amount - charge (CHG-5)', async () => {
  const accountId = await seedAccount();
  await setCharge(accountId, 'MTN', 'PERCENTAGE', 'MERCHANT', null, '2.50');
  await fund(accountId, 1_000_000n);

  const txn = await txns.processTransaction({
    accountId, type: 'COLLECTION', processor: 'MTN', amount: 200_000n,
    msisdn: '260970000001', idempotencyKey: 'A2', environment: 'SANDBOX',
  });

  assert.equal(txn.charge, 5_000n); // 2.50% of 200_000
  assert.equal(txn.netAmount, 195_000n); // MERCHANT -> amount - charge
  // required is still amount + charge regardless of fulfiller (TXN-2)
  assert.equal(await balanceOf(accountId), 795_000n); // 1_000_000 - 205_000
});

test('A3 TIERED source: charge = fixed + percentage (CHG-3)', async () => {
  const accountId = await seedAccount();
  await setCharge(accountId, 'MTN', 'TIERED', 'SOURCE', 1_000n, '1.00');
  await fund(accountId, 1_000_000n);

  const txn = await txns.processTransaction({
    accountId, type: 'COLLECTION', processor: 'MTN', amount: 100_000n,
    msisdn: '260970000001', idempotencyKey: 'A3', environment: 'SANDBOX',
  });

  assert.equal(txn.charge, 2_000n); // 1_000 fixed + 1.00% of 100_000 (1_000)
  assert.equal(txn.netAmount, 100_000n); // SOURCE
  assert.equal(await balanceOf(accountId), 898_000n); // 1_000_000 - 102_000
});

// ── Group B: finding ① — collection + settlement double-debit float ─────────

test('B FINDING ①: a successful collection reduces float at collection AND again at settlement', async () => {
  const accountId = await seedAccount();
  await setCharge(accountId, 'MTN', 'PERCENTAGE', 'SOURCE', null, '2.50');
  await fund(accountId, 1_000_000n);

  // 1) Collection of 100_000, charge 2_500 -> required 102_500 debited from float.
  const c = await collectSuccess(accountId, 100_000n, 'B-collect');
  assert.equal(c.charge, 2_500n);
  assert.equal(c.netAmount, 100_000n);
  assert.equal(await balanceOf(accountId), 897_500n); // -102_500 at collection

  // 2) Settlement pays out net_amount (100_000) as a second float DEBIT (SET-1/3).
  const run = await settlements.runForAccount(accountId, randomUUID());
  assert.equal(run.created, true);
  assert.equal(run.amount, 100_000n);
  await settlements.confirmSettlement({ settlementId: run.settlementId as string, actorId: randomUUID() });

  // CHARACTERIZATION of finding ①: a 100_000 collection ends with float DOWN 202_500
  // (102_500 at collection + 100_000 at settlement). Under a wallet model a collection
  // would CREDIT net and settlement DEBIT it, leaving float back at 1_000_000.
  // When finding ① is fixed this assertion must change — that is the intended signal.
  assert.equal(await balanceOf(accountId), 797_500n);
});

// ── Group C: finding ② — reversal after settlement, no clawback ─────────────

test('C FINDING ②: reversing an already-SETTLED collection refunds float with no clawback', async () => {
  const accountId = await seedAccount();
  await setCharge(accountId, 'MTN', 'FIXED', 'SOURCE', 500n, null);
  await fund(accountId, 1_000_000n);

  const c = await collectSuccess(accountId, 100_000n, 'C-collect'); // required 100_500
  assert.equal(c.charge, 500n);
  assert.equal(await balanceOf(accountId), 899_500n);

  // Settle and confirm the payout.
  const run = await settlements.runForAccount(accountId, randomUUID());
  await settlements.confirmSettlement({ settlementId: run.settlementId as string, actorId: randomUUID() });
  assert.equal(await balanceOf(accountId), 799_500n); // -100_000 payout

  // Reverse the collection AFTER it was settled/paid out.
  const reversed = await txns.reverseTransaction({ transactionId: c.id, accountId, actorId: randomUUID() });
  assert.equal(reversed.status, 'REVERSED');

  // CHARACTERIZATION of finding ②: reversal credits amount+charge (100_500) back to
  // float even though 100_000 already left via the settlement. There is no guard on
  // reversing a settled collection and no settlement clawback.
  assert.equal(await balanceOf(accountId), 900_000n); // 799_500 + 100_500 refunded

  // The settlement row is untouched by the reversal (still SETTLED).
  const s = await pool.query<{ status: string }>('SELECT status FROM settlements WHERE id = $1', [
    run.settlementId,
  ]);
  assert.equal(s.rows[0].status, 'SETTLED');

  // Side effect: the reversed collection drops out of the SUCCESS sum, so settleable
  // goes negative and future settlement runs are blocked until new collections cover it.
  const again = await settlements.runForAccount(accountId, randomUUID());
  assert.equal(again.created, false);
});

// ── Group D: finding ③ — reconciliation non-idempotency / terminal-state ────

test('D FINDING ③: re-running a report re-disputes a terminal txn and duplicates items', async () => {
  const accountId = await seedAccount();
  // Internal state is terminal REVERSED; the processor report still says SUCCESS.
  const reversedTxn = await insertTxn(accountId, 'REVERSED', 50_000n);
  const report = [{ transactionId: reversedTxn, processorStatus: 'SUCCESS' }];

  const first = await reconciliation.run({ processor: 'MTN', report, actorId: randomUUID() });
  assert.equal(first.disputed, 1); // REVERSED !== SUCCESS -> disputed
  const second = await reconciliation.run({ processor: 'MTN', report, actorId: randomUUID() });
  assert.equal(second.disputed, 1); // same terminal txn disputed AGAIN

  // CHARACTERIZATION of finding ③: two runs of the identical report leave two DISPUTED
  // items and two dispute audit rows for the same transaction — no idempotency per
  // (run, txn) and no skip for internal terminal states.
  const items = await pool.query<{ n: string }>(
    "SELECT COUNT(*)::text AS n FROM reconciliation_items WHERE transaction_id = $1 AND result = 'DISPUTED'",
    [reversedTxn],
  );
  assert.equal(items.rows[0].n, '2');

  const auditRows = await pool.query<{ n: string }>(
    "SELECT COUNT(*)::text AS n FROM audit_logs WHERE action = 'RECONCILIATION_DISPUTE' AND target = $1",
    [reversedTxn],
  );
  assert.equal(auditRows.rows[0].n, '2');
});

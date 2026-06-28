import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool } from '../src/database/database.module';
import { LedgerService } from '../src/ledger/ledger.service';
import { AuditService } from '../src/audit/audit.service';
import { FloatService } from '../src/float/float.service';
import { SettlementService } from '../src/settlements/settlement.service';
import { ReconciliationService } from '../src/settlements/reconciliation.service';
import { ConflictError } from '../src/money/errors';

const pool = createPool(process.env.DATABASE_URL);
const ledger = new LedgerService();
const audit = new AuditService();
const settlements = new SettlementService(pool, ledger, audit);
const reconciliation = new ReconciliationService(pool, audit);
const floats = new FloatService(pool, ledger, audit, { dualControlThreshold: 1_000_000_000n });

after(async () => {
  await pool.end();
});

async function seedAccount(): Promise<string> {
  const m = await pool.query<{ id: string }>(
    "INSERT INTO merchants (name, merchant_type, email) VALUES ('S','PRIVATE','s@s.zm') RETURNING id",
  );
  const a = await pool.query<{ id: string }>(
    "INSERT INTO accounts (merchant_id, account_type) VALUES ($1,'COLLECTION') RETURNING id",
    [m.rows[0].id],
  );
  return a.rows[0].id;
}

// Insert a final transaction directly to isolate settlement/recon from the engine.
async function insertTxn(
  accountId: string,
  status: string,
  netAmount: bigint,
  processor = 'MTN',
): Promise<string> {
  const t = await pool.query<{ id: string }>(
    `INSERT INTO transactions (account_id, type, processor, amount, net_amount, status, idempotency_key, environment)
     VALUES ($1,'COLLECTION',$2,$3,$3,$4,$5,'SANDBOX') RETURNING id`,
    [accountId, processor, netAmount.toString(), status, randomUUID()],
  );
  return t.rows[0].id;
}

async function balanceOf(accountId: string): Promise<bigint> {
  const r = await pool.query<{ float_balance: string }>(
    'SELECT float_balance FROM accounts WHERE id = $1',
    [accountId],
  );
  return BigInt(r.rows[0].float_balance);
}

test('SET-1: settleable = sum of SUCCESS collection net; creates one PENDING settlement', async () => {
  const accountId = await seedAccount();
  await insertTxn(accountId, 'SUCCESS', 200_000n);
  await insertTxn(accountId, 'SUCCESS', 100_000n);
  await insertTxn(accountId, 'FAILED', 999_999n); // excluded

  const run = await settlements.runForAccount(accountId, randomUUID());
  assert.equal(run.created, true);
  assert.equal(run.amount, 300_000n);

  // Running again finds nothing new (already reserved).
  const again = await settlements.runForAccount(accountId, randomUUID());
  assert.equal(again.created, false);
});

test('SET-2/3: confirm settles and writes a payout ledger DEBIT', async () => {
  const accountId = await seedAccount();
  await floats.creditFloat({ accountId, amount: 1_000_000n, actorId: randomUUID() }); // fund payout
  await insertTxn(accountId, 'SUCCESS', 250_000n);
  const run = await settlements.runForAccount(accountId, randomUUID());
  const settlementId = run.settlementId as string;

  await settlements.confirmSettlement({ settlementId, actorId: randomUUID() });

  const s = await pool.query<{ status: string; settled_at: Date | null }>(
    'SELECT status, settled_at FROM settlements WHERE id = $1',
    [settlementId],
  );
  assert.equal(s.rows[0].status, 'SETTLED');
  assert.ok(s.rows[0].settled_at);
  assert.equal(await balanceOf(accountId), 750_000n); // 1_000_000 - 250_000 (SET-3 ledger DEBIT)

  const led = await pool.query(
    "SELECT 1 FROM float_ledger WHERE reference = $1 AND counterparty = 'BANK_SETTLEMENT' AND entry_type = 'DEBIT'",
    [settlementId],
  );
  assert.equal(led.rowCount, 1);

  // Confirming again is rejected (not PENDING).
  await assert.rejects(settlements.confirmSettlement({ settlementId }), ConflictError);
});

test('SET-2: failed settlement retains funds → re-settleable next run', async () => {
  const accountId = await seedAccount();
  await insertTxn(accountId, 'SUCCESS', 80_000n);
  const first = await settlements.runForAccount(accountId, randomUUID());
  await settlements.failSettlement({
    settlementId: first.settlementId as string,
    actorId: randomUUID(),
    reason: 'bank rejected',
  });

  const f = await pool.query<{ status: string }>('SELECT status FROM settlements WHERE id = $1', [
    first.settlementId,
  ]);
  assert.equal(f.rows[0].status, 'FAILED');

  // Funds retained → the 80_000 is settleable again.
  const second = await settlements.runForAccount(accountId, randomUUID());
  assert.equal(second.created, true);
  assert.equal(second.amount, 80_000n);
});

test('REC-2/3/4: matched, disputed (mismatch) and unmatched are bucketed and flagged', async () => {
  const accountId = await seedAccount();
  const okTxn = await insertTxn(accountId, 'SUCCESS', 1_000n);
  const mismatchTxn = await insertTxn(accountId, 'SUCCESS', 1_000n); // internal SUCCESS, report FAILED

  const summary = await reconciliation.run({
    processor: 'MTN',
    actorId: randomUUID(),
    report: [
      { transactionId: okTxn, processorStatus: 'SUCCESS' },
      { transactionId: mismatchTxn, processorStatus: 'FAILED' },
      { transactionId: randomUUID(), processorStatus: 'SUCCESS' }, // not in our books
    ],
  });

  assert.equal(summary.matched, 1);
  assert.equal(summary.disputed, 1);
  assert.equal(summary.unmatched, 1);

  const run = await pool.query<{ matched: number; disputed: number; unmatched: number }>(
    'SELECT matched, disputed, unmatched FROM reconciliation_runs WHERE id = $1',
    [summary.runId],
  );
  assert.deepEqual(run.rows[0], { matched: 1, disputed: 1, unmatched: 1 });

  const disputedItem = await pool.query<{ result: string }>(
    'SELECT result FROM reconciliation_items WHERE run_id = $1 AND transaction_id = $2',
    [summary.runId, mismatchTxn],
  );
  assert.equal(disputedItem.rows[0].result, 'DISPUTED');

  const auditRow = await pool.query(
    "SELECT 1 FROM audit_logs WHERE action = 'RECONCILIATION_DISPUTE' AND target = $1",
    [mismatchTxn],
  );
  assert.equal(auditRow.rowCount, 1);
});

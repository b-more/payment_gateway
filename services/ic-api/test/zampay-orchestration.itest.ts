import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool } from '../src/database/database.module';
import { AuditService } from '../src/audit/audit.service';
import { ZampayOrchestrationService } from '../src/zampay/zampay-orchestration.service';
import type { ZampayInvoiceService, ZampayInvoiceResolution } from '../src/zampay/zampay-invoice.service';
import type { ZampaySettlementService, ZampaySettlementCallbackInput } from '../src/zampay/zampay-settlement.service';

// Deterministic, no network: the ZamPay client is faked so the full state
// machine (discover -> resolve -> wire -> callback) runs in CI.

const pool = createPool(process.env.DATABASE_URL);
const LUSAKA = {
  bankAccountNumber: '0132030000194', bicCode: 'INZAZMLX', sortCode: '090013',
  accountName: 'Lusaka City Council - Revenue', bankName: 'Indo-Zambia Bank Limited',
};
const NDOLA = { ...LUSAKA, bankAccountNumber: '0999', accountName: 'Ndola City Council' };

function fakeInvoices(resolution: ZampayInvoiceResolution[]): ZampayInvoiceService {
  return { resolve: async () => resolution } as unknown as ZampayInvoiceService;
}
function recordingSettlement(sink: ZampaySettlementCallbackInput[], fail = false): ZampaySettlementService {
  return {
    sendCallback: async (i: ZampaySettlementCallbackInput) => {
      if (fail) throw new Error('callback rejected');
      sink.push(i);
    },
  } as unknown as ZampaySettlementService;
}

async function seedCollection(reference: string, enabled = true): Promise<{ acct: string; txn: string; accountNumber: string }> {
  const tag = randomUUID().slice(0, 8);
  const m = await pool.query("INSERT INTO merchants (name,merchant_type,email,status) VALUES ('GSB','PRIVATE',$1,'APPROVED') RETURNING id", [`gsb-${tag}@x.zm`]);
  const a = await pool.query("INSERT INTO accounts (merchant_id,account_type,operating_mode) VALUES ($1,'COLLECTION','PRODUCTION') RETURNING id, account_number", [m.rows[0].id]);
  const acct = a.rows[0].id;
  // Only one account may be flag-enabled DB-wide (the production invariant), so
  // each seed takes over the single slot to keep tests isolated.
  if (enabled) await pool.query('UPDATE account_settings SET zampay_settlement_enabled = false WHERE zampay_settlement_enabled = true');
  await pool.query('INSERT INTO account_settings (account_id, zampay_settlement_enabled) VALUES ($1, $2)', [acct, enabled]);
  const t = await pool.query(
    `INSERT INTO transactions (account_id,type,processor,msisdn,amount,charge,net_amount,total_amount,status,idempotency_key,collection_reference,environment)
     VALUES ($1,'COLLECTION','MTN','260970000000',980,0,980,980,'SUCCESS',$2,$3,'PRODUCTION') RETURNING id`,
    [acct, randomUUID(), reference]);
  return { acct, txn: t.rows[0].id, accountNumber: a.rows[0].account_number };
}

let audit: AuditService;
before(() => { audit = new AuditService(); });
after(async () => { await pool.end(); });

// Full isolation: sendDueCallbacks/resolvePending scan the whole table (as in
// production), so each test resets first.
async function reset(): Promise<void> {
  await pool.query('DELETE FROM zampay_settlements');
  await pool.query('DELETE FROM transactions');
  await pool.query('DELETE FROM account_settings');
  await pool.query('DELETE FROM accounts');
  await pool.query("DELETE FROM merchants WHERE email LIKE '%@x.zm'");
}

describe('zampay orchestration', { concurrency: 1 }, () => {

test('happy path: discover -> resolve(NotPaid) -> auto callback -> settled', async () => {
  await reset();
  const { txn, accountNumber } = await seedCollection('REF-' + randomUUID().slice(0, 6));
  const sink: ZampaySettlementCallbackInput[] = [];
  const orch = new ZampayOrchestrationService(
    pool,
    fakeInvoices([{ invoiceNumber: 'INV-1', transactionNumber: 'TX-1', status: 'NotPaid', currency: 'ZMW',
      groups: [{ destination: LUSAKA, serviceIds: ['s1', 's2'], amountNgwee: 980n, currency: 'ZMW' }] }]),
    recordingSettlement(sink),
    audit,
  );

  assert.equal(await orch.discoverPending(accountNumber), 1);
  assert.deepEqual(await orch.resolvePending(), { resolved: 1, failed: 0 });

  // Resolve leaves it RESOLVED with a pending callback and our payment reference
  // (the transaction id) — no operator wire step.
  const row = (await pool.query("SELECT id, status, callback_status, payment_reference, destination->>'bankAccountNumber' acc, array_length(service_ids,1) n FROM zampay_settlements WHERE transaction_id=$1", [txn])).rows[0];
  assert.equal(row.status, 'RESOLVED');
  assert.equal(row.callback_status, 'PENDING');
  assert.equal(row.payment_reference, txn);
  assert.equal(row.acc, '0132030000194');
  assert.equal(row.n, 2);

  // The callback fires automatically on the next pass.
  assert.deepEqual(await orch.sendDueCallbacks(), { sent: 1, failed: 0 });
  const settled = (await pool.query('SELECT status, callback_status, settled_at FROM zampay_settlements WHERE id=$1', [row.id])).rows[0];
  assert.equal(settled.status, 'SETTLED');
  assert.equal(settled.callback_status, 'DELIVERED');
  assert.ok(settled.settled_at);

  assert.equal(sink.length, 1);
  assert.equal(sink[0].paymentReferenceNumber, txn); // our payment reference
  assert.equal(sink[0].amountNgwee, 980n);
  assert.deepEqual(sink[0].serviceIds, ['s1', 's2']);
});

test('two destinations on one invoice -> two instructions', async () => {
  await reset();
  const { txn, accountNumber } = await seedCollection('REF2-' + randomUUID().slice(0, 6));
  const orch = new ZampayOrchestrationService(
    pool,
    fakeInvoices([{ invoiceNumber: 'INV-2', transactionNumber: 'TX-2', status: 'NotPaid', currency: 'ZMW', groups: [
      { destination: LUSAKA, serviceIds: ['a'], amountNgwee: 550n, currency: 'ZMW' },
      { destination: NDOLA, serviceIds: ['b'], amountNgwee: 430n, currency: 'ZMW' },
    ] }]),
    recordingSettlement([]),
    audit,
  );
  await orch.discoverPending(accountNumber);
  await orch.resolvePending();
  const rows = (await pool.query("SELECT destination->>'bankAccountNumber' acc, status FROM zampay_settlements WHERE transaction_id=$1 ORDER BY amount_ngwee DESC", [txn])).rows;
  assert.equal(rows.length, 2, 'one instruction per destination account');
  assert.deepEqual(rows.map((r) => r.acc).sort(), ['0132030000194', '0999']);
  assert.ok(rows.every((r) => r.status === 'RESOLVED'));
});

test('Paid invoice with settleable services -> RESOLVED -> settled', async () => {
  await reset();
  const { txn, accountNumber } = await seedCollection('REF3-' + randomUUID().slice(0, 6));
  const sink: ZampaySettlementCallbackInput[] = [];
  const orch = new ZampayOrchestrationService(
    pool,
    fakeInvoices([{ invoiceNumber: 'INV-3', transactionNumber: 'TX-3', status: 'Paid', currency: 'ZMW',
      groups: [{ destination: LUSAKA, serviceIds: ['x'], amountNgwee: 980n, currency: 'ZMW' }] }]),
    recordingSettlement(sink),
    audit,
  );
  await orch.discoverPending(accountNumber);
  await orch.resolvePending();
  // GSB marks the invoice Paid on collection but still expects our settlement
  // callback — a Paid invoice is settled, not skipped.
  const row = (await pool.query("SELECT id, status, callback_status FROM zampay_settlements WHERE transaction_id=$1", [txn])).rows[0];
  assert.equal(row.status, 'RESOLVED');
  assert.equal(row.callback_status, 'PENDING');
  await orch.sendDueCallbacks();
  const settled = (await pool.query('SELECT status FROM zampay_settlements WHERE id=$1', [row.id])).rows[0];
  assert.equal(settled.status, 'SETTLED');
  assert.equal(sink.length, 1);
  assert.equal(sink[0].paymentReferenceNumber, txn);
});

test('Paid invoice with no settleable services -> INVOICE_PAID', async () => {
  await reset();
  const { txn, accountNumber } = await seedCollection('REF3b-' + randomUUID().slice(0, 6));
  const orch = new ZampayOrchestrationService(
    pool,
    fakeInvoices([{ invoiceNumber: 'INV-3b', transactionNumber: 'TX-3b', status: 'Paid', currency: 'ZMW', groups: [] }]),
    recordingSettlement([]),
    audit,
  );
  await orch.discoverPending(accountNumber);
  await orch.resolvePending();
  assert.equal((await pool.query('SELECT status FROM zampay_settlements WHERE transaction_id=$1', [txn])).rows[0].status, 'INVOICE_PAID');
});

test('callback failure increments attempts and stays pending', async () => {
  await reset();
  const { txn, accountNumber } = await seedCollection('REF4-' + randomUUID().slice(0, 6));
  const orch = new ZampayOrchestrationService(
    pool,
    fakeInvoices([{ invoiceNumber: 'INV-4', transactionNumber: 'TX-4', status: 'NotPaid', currency: 'ZMW',
      groups: [{ destination: LUSAKA, serviceIds: ['s'], amountNgwee: 980n, currency: 'ZMW' }] }]),
    recordingSettlement([], true),
    audit,
  );
  await orch.discoverPending(accountNumber);
  await orch.resolvePending();
  const id = (await pool.query('SELECT id FROM zampay_settlements WHERE transaction_id=$1', [txn])).rows[0].id;
  assert.deepEqual(await orch.sendDueCallbacks(), { sent: 0, failed: 1 });
  const after1 = (await pool.query('SELECT status, callback_status, callback_attempts FROM zampay_settlements WHERE id=$1', [id])).rows[0];
  assert.equal(after1.status, 'RESOLVED');       // stays resolved, callback retried next run
  assert.equal(after1.callback_status, 'PENDING');
  assert.equal(after1.callback_attempts, 1);
});

test('SINGLE-ACCOUNT: only the pinned account number is ever discovered', async () => {
  await reset();
  const enabled = await seedCollection('PIN-A-' + randomUUID().slice(0, 6));
  const orch = new ZampayOrchestrationService(pool, fakeInvoices([]), recordingSettlement([]), audit);

  // Discovering with a DIFFERENT account number picks up nothing, even though
  // this account is flag-enabled.
  const wrong = await orch.discoverPending('COL-9999999');
  assert.equal(wrong, 0);
  assert.equal((await pool.query('SELECT count(*)::int c FROM zampay_settlements WHERE transaction_id=$1', [enabled.txn])).rows[0].c, 0);

  // An empty pin discovers nothing.
  assert.equal(await orch.discoverPending(''), 0);

  // The correct account number picks it up.
  assert.equal(await orch.discoverPending(enabled.accountNumber), 1);
});

test('SINGLE-ACCOUNT: the DB forbids a second flag-enabled account', async () => {
  await reset();
  // One enabled account exists (this seed takes the single slot). Directly
  // enabling a second must be rejected by the partial unique index.
  await seedCollection('DBGUARD-1-' + randomUUID().slice(0, 6));
  const tag = randomUUID().slice(0, 8);
  const m = await pool.query("INSERT INTO merchants (name,merchant_type,email,status) VALUES ('X','PRIVATE',$1,'APPROVED') RETURNING id", [`x-${tag}@x.zm`]);
  const a = await pool.query("INSERT INTO accounts (merchant_id,account_type,operating_mode) VALUES ($1,'COLLECTION','PRODUCTION') RETURNING id", [m.rows[0].id]);
  await assert.rejects(
    pool.query('INSERT INTO account_settings (account_id, zampay_settlement_enabled) VALUES ($1, true)', [a.rows[0].id]),
    /uq_zampay_single_enabled_account|unique/i,
    'a second zampay_settlement_enabled account is structurally impossible',
  );
});
});

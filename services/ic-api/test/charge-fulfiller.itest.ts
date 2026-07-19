import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Fixed test env BEFORE any module loads crypto/config.
process.env.API_SIGNING_ENC_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.DUAL_CONTROL_THRESHOLD = '1000000000';
process.env.API_RATE_MAX = '100000';
process.env.WEBHOOK_WORKER = 'off';

import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { createPool } from '../src/database/database.module';
import { TransactionService } from '../src/transactions/transaction.service';
import { AccountProvisioningService } from '../src/onboarding/account-provisioning.service';
import { OnboardingService } from '../src/onboarding/onboarding.service';
import type { ChargeFulfiller } from '../src/money/types';

const pool = createPool(process.env.DATABASE_URL);
let app: INestApplication;
let txns: TransactionService;
let provisioning: AccountProvisioningService;
let onboarding: OnboardingService;

before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  await app.init();
  txns = app.get(TransactionService);
  provisioning = app.get(AccountProvisioningService);
  onboarding = app.get(OnboardingService);
});

after(async () => {
  await app?.close();
  await pool.end();
});

/** Full onboarding path: apply with a fee-bearer choice, approve, provision. */
async function onboardMerchant(fulfiller: ChargeFulfiller): Promise<string> {
  const tag = randomUUID().slice(0, 8);
  const { merchantId } = await onboarding.submitApplication({
    merchant: { name: `T-${tag}`, merchantType: 'PRIVATE', email: `m-${tag}@t.zm` },
    admin: { name: 'A', email: `a-${tag}@t.zm` },
    chargeFulfiller: fulfiller,
  });
  await pool.query("UPDATE merchants SET status='APPROVED' WHERE id=$1", [merchantId]);
  const { accountId } = await provisioning.provisionAccount({
    merchantId,
    accountType: 'COLLECTION',
    actorId: randomUUID(),
  });
  await pool.query("UPDATE accounts SET operating_mode='PRODUCTION' WHERE id=$1", [accountId]);
  return accountId;
}

async function ledgerSum(accountId: string): Promise<bigint> {
  const r = await pool.query<{ s: string | null }>(
    `SELECT COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount ELSE -amount END),0)::text AS s
       FROM float_ledger WHERE account_id = $1`,
    [accountId],
  );
  return BigInt(r.rows[0].s ?? '0');
}

test('provisioning seeds a charge config for every rail from the merchant choice', async () => {
  const accountId = await onboardMerchant('SOURCE');
  const r = await pool.query<{ processor: string; charge_fulfiller: string }>(
    'SELECT processor, charge_fulfiller FROM charge_configs WHERE account_id=$1 ORDER BY processor',
    [accountId],
  );
  assert.equal(r.rowCount, 5, 'all five rails seeded');
  for (const row of r.rows) {
    assert.equal(row.charge_fulfiller, 'SOURCE', `${row.processor} honours the application choice`);
  }
});

test('a merchant who did not choose defaults to bearing the fee', async () => {
  const tag = randomUUID().slice(0, 8);
  const { merchantId } = await onboarding.submitApplication({
    merchant: { name: `D-${tag}`, merchantType: 'PRIVATE', email: `d-${tag}@t.zm` },
    admin: { name: 'A', email: `da-${tag}@t.zm` },
    // chargeFulfiller deliberately omitted
  });
  const r = await pool.query<{ charge_fulfiller: string }>(
    'SELECT charge_fulfiller FROM merchants WHERE id=$1',
    [merchantId],
  );
  assert.equal(r.rows[0].charge_fulfiller, 'MERCHANT');
});

// The heart of it. Under both modes Instacom must end up with exactly the fee.
// The old code credited the merchant the full amount under SOURCE while only
// debiting the customer the principal, so Instacom retained nothing.
for (const [fulfiller, expected] of [
  ['SOURCE', { customerPays: 5125n, merchantGets: 5000n }],
  ['MERCHANT', { customerPays: 5000n, merchantGets: 4875n }],
] as const) {
  test(`${fulfiller}: customer pays ${expected.customerPays}, merchant nets ${expected.merchantGets}`, async () => {
    const accountId = await onboardMerchant(fulfiller);
    const before = await ledgerSum(accountId);

    const txn = await txns.processTransaction({
      accountId,
      type: 'COLLECTION',
      processor: 'MTN',
      amount: 5000n, // K50.00, seeded rate is 2.50% => 125 ngwee
      msisdn: '260970000000',
      idempotencyKey: randomUUID(),
      environment: 'PRODUCTION',
    });

    assert.equal(txn.charge, 125n, 'fee is 2.50% of 5000');
    assert.equal(txn.totalAmount, expected.customerPays, 'what the customer is debited');
    assert.equal(txn.netAmount, expected.merchantGets, 'what the merchant nets');

    await txns.completeTransaction({
      transactionId: txn.id,
      result: { status: 'SUCCESS', reference: `ref-${txn.id}` },
      actorId: null,
    });

    const credited = (await ledgerSum(accountId)) - before;
    assert.equal(credited, expected.merchantGets, 'ledger credits the net');

    // The invariant: gross in, net to the merchant, difference is ours.
    assert.equal(
      txn.totalAmount - credited,
      txn.charge,
      `Instacom must retain exactly ${txn.charge}, retained ${txn.totalAmount - credited}`,
    );
  });
}

test('a disbursement ignores the fee-bearer: the merchant always pays it', async () => {
  const accountId = await onboardMerchant('SOURCE');
  await pool.query(
    `INSERT INTO float_ledger (account_id, entry_type, amount, balance_after, counterparty, reference)
     VALUES ($1,'CREDIT',100000,100000,'TEST','seed')`,
    [accountId],
  );
  await pool.query('UPDATE accounts SET float_balance=100000 WHERE id=$1', [accountId]);

  const txn = await txns.processTransaction({
    accountId,
    type: 'DISBURSEMENT',
    processor: 'MTN',
    amount: 5000n,
    msisdn: '260970000000',
    idempotencyKey: randomUUID(),
    environment: 'PRODUCTION',
  });

  // Payee receives the full amount even though the account is set to SOURCE.
  assert.equal(txn.totalAmount, 5000n, 'payee receives the principal');
  assert.equal(txn.charge, 125n);

  const r = await pool.query<{ amount: string }>(
    "SELECT amount::text FROM float_ledger WHERE reference=$1 AND entry_type='DEBIT'",
    [txn.id],
  );
  assert.equal(r.rows[0]?.amount, '5125', 'float is debited amount + charge');
});

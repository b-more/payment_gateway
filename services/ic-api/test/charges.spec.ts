import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCharge, computeAmounts, type ChargeConfig } from '../src/money/charges';

const fixed = (v: bigint): ChargeConfig => ({ chargeType: 'FIXED', fixedValue: v, percentScaled: 0n });
const pct = (scaled: bigint): ChargeConfig => ({
  chargeType: 'PERCENTAGE',
  fixedValue: 0n,
  percentScaled: scaled,
});
const tiered = (v: bigint, scaled: bigint): ChargeConfig => ({
  chargeType: 'TIERED',
  fixedValue: v,
  percentScaled: scaled,
});

test('CHG-1 FIXED: charge is the fixed value', () => {
  assert.equal(computeCharge(fixed(500n), 100000n), 500n);
});

test('CHG-2 PERCENTAGE: 2.50% of 100000 ngwee = 2500', () => {
  assert.equal(computeCharge(pct(250n), 100000n), 2500n);
});

test('CHG-2 PERCENTAGE rounds half-up to the nearest ngwee', () => {
  // 1.00% of 12345 = 123.45 -> 123 ; of 12350 = 123.50 -> 124
  assert.equal(computeCharge(pct(100n), 12345n), 123n);
  assert.equal(computeCharge(pct(100n), 12350n), 124n);
});

test('CHG-3 TIERED: fixed + percentage', () => {
  // 200 fixed + 1.50% of 100000 (=1500) = 1700
  assert.equal(computeCharge(tiered(200n, 150n), 100000n), 1700n);
});

test('CHG-4 SOURCE: customer is debited amount + charge, merchant nets full amount', () => {
  const a = computeAmounts(fixed(500n), 'SOURCE', 100000n);
  assert.deepEqual(a, {
    amount: 100000n,
    charge: 500n,
    netAmount: 100000n,
    totalAmount: 100500n, // what the customer actually pays
    required: 100500n,
  });
});

test('CHG-5 MERCHANT: customer is debited amount, merchant nets amount - charge', () => {
  const a = computeAmounts(fixed(500n), 'MERCHANT', 100000n);
  assert.deepEqual(a, {
    amount: 100000n,
    charge: 500n,
    netAmount: 99500n,
    totalAmount: 100000n,
    required: 100500n,
  });
});

// The invariant that matters, and the one whose absence let SOURCE ship
// broken: whoever bears the fee, Instacom ends up with exactly `charge`.
// Under the old code SOURCE debited the customer `amount` and credited the
// merchant `amount`, so this difference was 0 and the fee vanished.
for (const fulfiller of ['SOURCE', 'MERCHANT'] as const) {
  test(`Instacom retains exactly the charge under ${fulfiller}`, () => {
    for (const amount of [1n, 99n, 5000n, 100000n, 123457n]) {
      const a = computeAmounts(pct(250n), fulfiller, amount);
      assert.equal(
        a.totalAmount - a.netAmount,
        a.charge,
        `${fulfiller} at ${amount}: customer paid ${a.totalAmount}, merchant got ${a.netAmount}`,
      );
    }
  });
}

test('a collection at 2.50% of an odd amount rounds half-up and still balances', () => {
  // 2.50% of 12345 = 308.625 -> 309
  const a = computeAmounts(pct(250n), 'SOURCE', 12345n);
  assert.equal(a.charge, 309n);
  assert.equal(a.totalAmount, 12654n);
  assert.equal(a.netAmount, 12345n);
  assert.equal(a.totalAmount - a.netAmount, a.charge);
});

test('DISBURSEMENT ignores the fee-bearer: the merchant always pays it', () => {
  const asSource = computeAmounts(fixed(500n), 'SOURCE', 100000n, 'DISBURSEMENT');
  const asMerchant = computeAmounts(fixed(500n), 'MERCHANT', 100000n, 'DISBURSEMENT');
  assert.deepEqual(asSource, asMerchant);
  // The payee receives the full amount; float covers amount + charge.
  assert.equal(asSource.totalAmount, 100000n);
  assert.equal(asSource.required, 100500n);
});

test('MERCHANT fulfiller with charge exceeding amount is rejected', () => {
  assert.throws(() => computeAmounts(fixed(200n), 'MERCHANT', 100n), /charge exceeds amount/);
});

test('zero-amount percentage charge is zero', () => {
  assert.equal(computeCharge(pct(250n), 0n), 0n);
});

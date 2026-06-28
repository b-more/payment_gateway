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

test('CHG-4 SOURCE: customer bears charge, merchant nets full amount', () => {
  const a = computeAmounts(fixed(500n), 'SOURCE', 100000n);
  assert.deepEqual(a, { amount: 100000n, charge: 500n, netAmount: 100000n, required: 100500n });
});

test('CHG-5 MERCHANT: merchant bears charge, nets amount - charge', () => {
  const a = computeAmounts(fixed(500n), 'MERCHANT', 100000n);
  assert.deepEqual(a, { amount: 100000n, charge: 500n, netAmount: 99500n, required: 100500n });
});

test('MERCHANT fulfiller with charge exceeding amount is rejected', () => {
  assert.throws(() => computeAmounts(fixed(200n), 'MERCHANT', 100n), /charge exceeds amount/);
});

test('zero-amount percentage charge is zero', () => {
  assert.equal(computeCharge(pct(250n), 0n), 0n);
});

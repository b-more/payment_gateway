import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toNgwee, roundHalfUp, parsePercentToScaled } from '../src/money/money';

test('NN-1 toNgwee accepts non-negative integers and bigints', () => {
  assert.equal(toNgwee(0), 0n);
  assert.equal(toNgwee(100), 100n);
  assert.equal(toNgwee('250'), 250n);
  assert.equal(toNgwee(100n), 100n);
});

test('NN-1 toNgwee rejects floats, negatives and junk', () => {
  assert.throws(() => toNgwee(1.5), /integer/);
  assert.throws(() => toNgwee(-1), />= 0/);
  assert.throws(() => toNgwee(-1n), />= 0/);
  assert.throws(() => toNgwee('1.5'), /integer string/);
  assert.throws(() => toNgwee('abc'), /integer string/);
});

test('roundHalfUp rounds at the .5 boundary', () => {
  assert.equal(roundHalfUp(123n, 10n), 12n); // 12.3 -> 12
  assert.equal(roundHalfUp(125n, 10n), 13n); // 12.5 -> 13
  assert.equal(roundHalfUp(0n, 10n), 0n);
});

test('parsePercentToScaled parses numeric(5,2) text without floats', () => {
  assert.equal(parsePercentToScaled('2.50'), 250n);
  assert.equal(parsePercentToScaled('2.5'), 250n);
  assert.equal(parsePercentToScaled('10'), 1000n);
  assert.equal(parsePercentToScaled('0.01'), 1n);
  assert.throws(() => parsePercentToScaled('2.555'), /invalid percent/);
});

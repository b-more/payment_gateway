import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ngweeToAmount, amountToNgwee } from '../src/mtn/money';

test('ngweeToAmount: 2-dp decimal string', () => {
  assert.equal(ngweeToAmount(100n), '1.00');
  assert.equal(ngweeToAmount(150n), '1.50');
  assert.equal(ngweeToAmount(0n), '0.00');
  assert.equal(ngweeToAmount(12345n), '123.45');
});
test('ngweeToAmount rejects negative', () => {
  assert.throws(() => ngweeToAmount(-1n));
});
test('amountToNgwee: string/number inputs', () => {
  assert.equal(amountToNgwee('1.50'), 150n);
  assert.equal(amountToNgwee('1.5'), 150n);
  assert.equal(amountToNgwee(2), 200n);
  assert.equal(amountToNgwee('123.45'), 12345n);
});
test('amountToNgwee rounds half-up on the third decimal', () => {
  assert.equal(amountToNgwee('1.005'), 101n);
  assert.equal(amountToNgwee('1.004'), 100n);
});
test('amountToNgwee rejects malformed input', () => {
  assert.throws(() => amountToNgwee('abc'));
});
test('round-trips to 2dp', () => {
  for (const n of [0n, 1n, 99n, 100n, 150n, 12345n]) {
    assert.equal(amountToNgwee(ngweeToAmount(n)), n);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ngweeToKwacha, kwachaToNgwee } from '../src/airtel/money';

test('ngweeToKwacha: 100 ngwee = K1.00 -> 1', () => {
  assert.equal(ngweeToKwacha(100n), 1);
});
test('ngweeToKwacha: 150 ngwee = K1.50 -> 1.5', () => {
  assert.equal(ngweeToKwacha(150n), 1.5);
});
test('ngweeToKwacha: 0 and large values', () => {
  assert.equal(ngweeToKwacha(0n), 0);
  assert.equal(ngweeToKwacha(12345n), 123.45);
  assert.equal(ngweeToKwacha(1_000_000_00n), 1_000_000);
});
test('ngweeToKwacha rejects negative', () => {
  assert.throws(() => ngweeToKwacha(-1n));
});

test('kwachaToNgwee: number and string inputs', () => {
  assert.equal(kwachaToNgwee(1), 100n);
  assert.equal(kwachaToNgwee(1.5), 150n);
  assert.equal(kwachaToNgwee('1.50'), 150n);
  assert.equal(kwachaToNgwee('123.45'), 12345n);
  assert.equal(kwachaToNgwee('7'), 700n);
});
test('kwachaToNgwee rounds half-up on the third decimal', () => {
  assert.equal(kwachaToNgwee('1.005'), 101n);
  assert.equal(kwachaToNgwee('1.004'), 100n);
});
test('kwachaToNgwee rejects malformed input', () => {
  assert.throws(() => kwachaToNgwee('abc'));
  assert.throws(() => kwachaToNgwee('1.2.3'));
});

test('round-trip ngwee -> kwacha -> ngwee is stable to 2dp', () => {
  for (const n of [0n, 1n, 99n, 100n, 150n, 12345n]) {
    assert.equal(kwachaToNgwee(ngweeToKwacha(n)), n);
  }
});

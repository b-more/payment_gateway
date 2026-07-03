import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertAttemptTransition,
  canTransitionAttempt,
  isFinalAttemptState,
  mapAirtelStatus,
  airtelTxnId,
} from '../src/airtel/airtel-attempt';

test('legal attempt transitions', () => {
  assert.ok(canTransitionAttempt('CREATED', 'INITIATED'));
  assert.ok(canTransitionAttempt('INITIATED', 'PENDING'));
  assert.ok(canTransitionAttempt('INITIATED', 'UNKNOWN'));
  assert.ok(canTransitionAttempt('PENDING', 'SUCCESS'));
  assert.ok(canTransitionAttempt('UNKNOWN', 'FAILED'));
  assert.ok(canTransitionAttempt('UNKNOWN', 'PENDING'));
});

test('illegal attempt transitions throw', () => {
  assert.throws(() => assertAttemptTransition('SUCCESS', 'FAILED'));
  assert.throws(() => assertAttemptTransition('FAILED', 'SUCCESS'));
  assert.throws(() => assertAttemptTransition('CREATED', 'PENDING'));
});

test('final states', () => {
  assert.ok(isFinalAttemptState('SUCCESS'));
  assert.ok(isFinalAttemptState('FAILED'));
  assert.ok(!isFinalAttemptState('PENDING'));
  assert.ok(!isFinalAttemptState('UNKNOWN'));
});

test('Airtel status mapping', () => {
  assert.equal(mapAirtelStatus('TS'), 'SUCCESS');
  assert.equal(mapAirtelStatus('TF'), 'FAILED');
  assert.equal(mapAirtelStatus('TA'), 'FAILED');
  assert.equal(mapAirtelStatus('TIP'), 'PENDING');
  assert.equal(mapAirtelStatus(undefined), 'PENDING');
});

test('airtelTxnId is deterministic per (txn, attempt) and encodes the attempt', () => {
  const txn = '3f9a1c2d-1111-2222-3333-444455556666';
  assert.equal(airtelTxnId(txn, 1), 'INS-3F9A1C2D11112222-A01');
  assert.equal(airtelTxnId(txn, 2), 'INS-3F9A1C2D11112222-A02');
  assert.notEqual(airtelTxnId(txn, 1), airtelTxnId(txn, 2));
});

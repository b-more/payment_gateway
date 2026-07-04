import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertAttemptTransition, canTransitionAttempt, isFinalAttemptState, mapMtnStatus } from '../src/mtn/mtn-attempt';
import { mtnPartyId, mtnReason } from '../src/mtn/mtn-response';

test('legal/illegal transitions', () => {
  assert.ok(canTransitionAttempt('CREATED', 'INITIATED'));
  assert.ok(canTransitionAttempt('INITIATED', 'PENDING'));
  assert.ok(canTransitionAttempt('PENDING', 'SUCCESS'));
  assert.throws(() => assertAttemptTransition('SUCCESS', 'FAILED'));
  assert.throws(() => assertAttemptTransition('CREATED', 'PENDING'));
});

test('MTN status mapping', () => {
  assert.equal(mapMtnStatus('SUCCESSFUL'), 'SUCCESS');
  assert.equal(mapMtnStatus('FAILED'), 'FAILED');
  assert.equal(mapMtnStatus('REJECTED'), 'FAILED');
  assert.equal(mapMtnStatus('PENDING'), 'PENDING');
  assert.equal(mapMtnStatus(undefined), 'PENDING');
});

test('final states', () => {
  assert.ok(isFinalAttemptState('SUCCESS'));
  assert.ok(isFinalAttemptState('FAILED'));
  assert.ok(!isFinalAttemptState('PENDING'));
});

test('mtnPartyId builds full international MSISDN', () => {
  assert.equal(mtnPartyId('260960000000'), '260960000000');
  assert.equal(mtnPartyId('0960000000'), '260960000000');
  assert.equal(mtnPartyId('960000000'), '260960000000');
  assert.equal(mtnPartyId('+260 96 000 0000'), '260960000000');
});

test('mtnReason handles string or object', () => {
  assert.equal(mtnReason({ reason: 'PAYER_NOT_FOUND' }), 'PAYER_NOT_FOUND');
  assert.equal(mtnReason({ reason: { code: 'PAYER_NOT_FOUND', message: 'x' } }), 'PAYER_NOT_FOUND');
  assert.equal(mtnReason({}), null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, assertTransition } from '../src/money/state-machine';
import { IllegalTransitionError } from '../src/money/errors';
import type { TransactionStatus } from '../src/money/types';

const LEGAL: ReadonlyArray<[TransactionStatus, TransactionStatus]> = [
  ['PENDING', 'PROCESSING'],
  ['PENDING', 'EXPIRED'],
  ['PROCESSING', 'SUCCESS'],
  ['PROCESSING', 'FAILED'],
  ['SUCCESS', 'REVERSED'],
];

const ILLEGAL: ReadonlyArray<[TransactionStatus, TransactionStatus]> = [
  ['PENDING', 'SUCCESS'],
  ['PROCESSING', 'REVERSED'],
  ['SUCCESS', 'FAILED'],
  ['FAILED', 'PROCESSING'],
  ['REVERSED', 'SUCCESS'],
  ['EXPIRED', 'PROCESSING'],
  ['SUCCESS', 'SUCCESS'],
];

test('STATE-1: all and only the documented transitions are legal', () => {
  for (const [from, to] of LEGAL) {
    assert.equal(canTransition(from, to), true, `${from}->${to} should be legal`);
  }
  for (const [from, to] of ILLEGAL) {
    assert.equal(canTransition(from, to), false, `${from}->${to} should be illegal`);
  }
});

test('STATE-2: assertTransition throws IllegalTransitionError on an illegal move', () => {
  assert.throws(() => assertTransition('SUCCESS', 'FAILED'), IllegalTransitionError);
  assert.doesNotThrow(() => assertTransition('PROCESSING', 'SUCCESS'));
});

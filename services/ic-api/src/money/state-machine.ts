import { IllegalTransitionError } from './errors';
import type { TransactionStatus } from './types';

// Transaction state machine (§5.5). Only these transitions are legal (STATE-1):
//   PENDING    -> PROCESSING, EXPIRED
//   PROCESSING -> SUCCESS, FAILED
//   SUCCESS    -> REVERSED
// Everything else is rejected (STATE-2).
const ALLOWED: Readonly<Record<TransactionStatus, readonly TransactionStatus[]>> = {
  PENDING: ['PROCESSING', 'EXPIRED'],
  PROCESSING: ['SUCCESS', 'FAILED'],
  SUCCESS: ['REVERSED'],
  FAILED: [],
  REVERSED: [],
  EXPIRED: [],
};

export function canTransition(from: TransactionStatus, to: TransactionStatus): boolean {
  return ALLOWED[from].includes(to);
}

/** Throw IllegalTransitionError if the transition is not permitted (STATE-2). */
export function assertTransition(from: TransactionStatus, to: TransactionStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
}

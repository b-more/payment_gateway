// Per-attempt state machine + MTN status mapping. Mirrors the Airtel attempt
// model (kept separate so the two processor modules stay independent).
//   CREATED -> INITIATED -> PENDING -> (SUCCESS | FAILED | UNKNOWN)
//   UNKNOWN -> (SUCCESS | FAILED | PENDING)

import { randomUUID } from 'node:crypto';

export type AttemptState = 'CREATED' | 'INITIATED' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'UNKNOWN';

const ALLOWED: Readonly<Record<AttemptState, readonly AttemptState[]>> = {
  CREATED: ['INITIATED', 'FAILED', 'UNKNOWN'],
  INITIATED: ['PENDING', 'SUCCESS', 'FAILED', 'UNKNOWN'],
  PENDING: ['SUCCESS', 'FAILED', 'UNKNOWN'],
  UNKNOWN: ['SUCCESS', 'FAILED', 'PENDING'],
  SUCCESS: [],
  FAILED: [],
};

export function isFinalAttemptState(s: AttemptState): boolean {
  return s === 'SUCCESS' || s === 'FAILED';
}
export function canTransitionAttempt(from: AttemptState, to: AttemptState): boolean {
  return ALLOWED[from].includes(to);
}
export function assertAttemptTransition(from: AttemptState, to: AttemptState): void {
  if (!canTransitionAttempt(from, to)) {
    throw new Error(`illegal mtn attempt transition ${from} -> ${to}`);
  }
}

/** MTN status -> our resolution. SUCCESSFUL is final success; FAILED is final. */
export function mapMtnStatus(status: string | null | undefined): 'SUCCESS' | 'FAILED' | 'PENDING' {
  switch ((status ?? '').toUpperCase()) {
    case 'SUCCESSFUL':
      return 'SUCCESS';
    case 'FAILED':
    case 'REJECTED':
    case 'TIMEOUT':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}

/** X-Reference-Id — MTN requires a UUID; also our idempotency key, never reused. */
export function mtnRefId(): string {
  return randomUUID();
}

// Per-attempt state machine (§ STATE MACHINE) and Airtel status mapping.
//
//   CREATED -> INITIATED -> PENDING -> (SUCCESS | FAILED | UNKNOWN)
//   UNKNOWN -> (SUCCESS | FAILED | PENDING)   [resolved by enquiry/callback]
//   a pre-flight failure can go CREATED -> FAILED
//   a timeout on the POST goes INITIATED -> UNKNOWN (may have succeeded server-side)
//
// SUCCESS and FAILED are terminal. Everything here is pure and unit-tested.

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
    throw new Error(`illegal airtel attempt transition ${from} -> ${to}`);
  }
}

/**
 * Map an Airtel transaction status code to our resolution.
 *   TS  -> SUCCESS (final success, per enquiry spec)
 *   TF  -> FAILED
 *   TA  -> FAILED (aborted)
 *   TIP / anything else -> PENDING (not yet final)
 */
export function mapAirtelStatus(code: string | null | undefined): 'SUCCESS' | 'FAILED' | 'PENDING' {
  switch ((code ?? '').toUpperCase()) {
    case 'TS':
      return 'SUCCESS';
    case 'TF':
    case 'TA':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}

/**
 * Our globally-unique id sent to Airtel as transaction.id — never reused.
 * Shape: INS-<16 hex of the txn uuid>-A<attempt, 2 digits>. Combined with the
 * UNIQUE constraint on airtel_txn_id this guarantees no id is ever repeated.
 */
export function airtelTxnId(transactionId: string, attemptNo: number): string {
  const compact = transactionId.replace(/-/g, '').slice(0, 16).toUpperCase();
  return `INS-${compact}-A${String(attemptNo).padStart(2, '0')}`;
}

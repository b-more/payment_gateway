// Persistence port for Airtel attempts. The payments/disbursement services
// depend on this interface (not the DB) so their orchestration logic is unit
// tested with an in-memory fake; the PG implementation lives in the repository.

import type { AttemptState } from './airtel-attempt';

export type AttemptDirection = 'COLLECTION' | 'DISBURSEMENT';
export type TransitionSource = 'API' | 'ENQUIRY' | 'CALLBACK' | 'RECONCILE';

export interface AirtelAttempt {
  id: string;
  transactionId: string | null;
  direction: AttemptDirection;
  airtelEnv: string;
  msisdn: string | null;
  amountNgwee: bigint | null;
  airtelTxnId: string;
  attemptNo: number;
  state: AttemptState;
  airtelMoneyId: string | null;
  resultCode: string | null;
  requestId: string | null;
  failureReason: string | null;
}

export interface CreateAttemptInput {
  transactionId: string | null;
  direction: AttemptDirection;
  airtelEnv: string;
  msisdn: string | null;
  amountNgwee: bigint | null;
  airtelTxnId: string;
  attemptNo: number;
}

export interface TransitionPatch {
  to: AttemptState;
  source: TransitionSource;
  airtelMoneyId?: string | null;
  resultCode?: string | null;
  requestId?: string | null;
  failureReason?: string | null;
  detail?: Record<string, unknown>;
}

export interface AirtelAttemptStore {
  create(input: CreateAttemptInput): Promise<AirtelAttempt>;
  /** Assert the transition, append an event, update the row. Returns the new row. */
  transition(attemptId: string, patch: TransitionPatch): Promise<AirtelAttempt>;
  findByAirtelTxnId(airtelTxnId: string): Promise<AirtelAttempt | null>;
  /** Highest attempt_no for a transaction (0 if none) — for numbering the next attempt. */
  latestAttemptNo(transactionId: string): Promise<number>;
}

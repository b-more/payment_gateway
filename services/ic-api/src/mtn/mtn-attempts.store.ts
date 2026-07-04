import type { AttemptState } from './mtn-attempt';

export type AttemptDirection = 'COLLECTION' | 'DISBURSEMENT';
export type TransitionSource = 'API' | 'STATUS' | 'CALLBACK' | 'RECONCILE';

export interface MtnAttempt {
  id: string;
  transactionId: string | null;
  direction: AttemptDirection;
  mtnEnv: string;
  msisdn: string | null;
  amountNgwee: bigint | null;
  mtnRefId: string;
  externalId: string | null;
  attemptNo: number;
  state: AttemptState;
  financialTransactionId: string | null;
  reason: string | null;
}

export interface CreateAttemptInput {
  transactionId: string | null;
  direction: AttemptDirection;
  mtnEnv: string;
  msisdn: string | null;
  amountNgwee: bigint | null;
  mtnRefId: string;
  externalId: string | null;
  attemptNo: number;
}

export interface TransitionPatch {
  to: AttemptState;
  source: TransitionSource;
  financialTransactionId?: string | null;
  reason?: string | null;
  detail?: Record<string, unknown>;
}

export interface MtnAttemptStore {
  create(input: CreateAttemptInput): Promise<MtnAttempt>;
  transition(attemptId: string, patch: TransitionPatch): Promise<MtnAttempt>;
  findByRefId(mtnRefId: string): Promise<MtnAttempt | null>;
  latestAttemptNo(transactionId: string): Promise<number>;
}

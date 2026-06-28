import type { TransactionRecord } from '../transactions/transaction.service';

// Money is serialized as integer-ngwee STRINGS (never JSON numbers — NN-1).

export interface TransactionResponse {
  id: string;
  type: string;
  processor: string;
  msisdn: string | null;
  amount: string;
  charge: string;
  net_amount: string;
  status: string;
  failure_reason: string | null;
  idempotency_key: string;
  collection_reference: string | null;
  environment: string;
}

export function serializeTransaction(t: TransactionRecord): TransactionResponse {
  return {
    id: t.id,
    type: t.type,
    processor: t.processor,
    msisdn: t.msisdn,
    amount: t.amount.toString(),
    charge: t.charge.toString(),
    net_amount: t.netAmount.toString(),
    status: t.status,
    failure_reason: t.failureReason,
    idempotency_key: t.idempotencyKey,
    collection_reference: t.collectionReference,
    environment: t.environment,
  };
}

// Shared Airtel response parsing + attempt→engine mapping, used by both the
// collections and disbursements services. Kept log-safe: summarize() returns
// only non-sensitive fields.

import type { AttemptState } from './airtel-attempt';
import type { AirtelAttempt } from './airtel-attempts.store';
import type { ProcessorResult } from '../processors/processor.service';

export interface AirtelTxnBody {
  data?: {
    transaction?: { id?: string; status?: string; airtel_money_id?: string; message?: string };
  };
  status?: { code?: string; result_code?: string; response_code?: string; message?: string; success?: boolean };
}

/** A compact, log-safe summary of an Airtel response body (no tokens/PIN/PII). */
export function summarize(body: AirtelTxnBody): Record<string, unknown> {
  return {
    status: body.data?.transaction?.status ?? body.status?.code,
    airtel_money_id: body.data?.transaction?.airtel_money_id,
    result_code: body.status?.result_code,
    message: body.status?.message ?? body.data?.transaction?.message,
  };
}

export function moneyId(body: AirtelTxnBody): string | null {
  // Airtel returns "NA" as a placeholder before the money id is assigned.
  const v = body.data?.transaction?.airtel_money_id;
  return v && v !== 'NA' ? v : null;
}

export function statusCode(body: AirtelTxnBody): string | undefined {
  return body.data?.transaction?.status;
}

/** Strip the Zambian country code — Airtel wants the 9-digit subscriber number. */
export function zmSubscriberMsisdn(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('260')) d = d.slice(3);
  if (d.length === 10 && d.startsWith('0')) d = d.slice(1);
  return d;
}

/**
 * Airtel requires `reference` to be ALPHANUMERIC ONLY, length 4–64. Gateway refs
 * (e.g. "INV-000123") often contain separators, so strip them and pad if short.
 */
export function sanitizeReference(raw: string): string {
  const clean = (raw ?? '').replace(/[^a-zA-Z0-9]/g, '');
  if (clean.length >= 4) return clean.slice(0, 64);
  return (clean + 'REF').padEnd(4, '0').slice(0, 64);
}

export interface AttemptOutcome {
  attemptId: string;
  airtelTxnId: string;
  state: AttemptState;
  airtelMoneyId: string | null;
  failureReason: string | null;
}

export function asOutcome(a: AirtelAttempt): AttemptOutcome {
  return {
    attemptId: a.id,
    airtelTxnId: a.airtelTxnId,
    state: a.state,
    airtelMoneyId: a.airtelMoneyId,
    failureReason: a.failureReason,
  };
}

/** Map a resolved attempt to the engine's ProcessorResult; null if not final. */
export function attemptToProcessorResult(o: AttemptOutcome): ProcessorResult | null {
  if (o.state === 'SUCCESS') {
    return { status: 'SUCCESS', reference: o.airtelMoneyId ?? o.airtelTxnId };
  }
  if (o.state === 'FAILED') {
    return {
      status: 'FAILED',
      reference: o.airtelMoneyId ?? o.airtelTxnId,
      failureReason: o.failureReason ?? 'AIRTEL_DECLINED',
    };
  }
  return null;
}

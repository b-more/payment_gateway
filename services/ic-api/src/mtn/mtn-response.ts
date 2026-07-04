// Shared MTN response parsing + attempt->engine mapping.

import type { AttemptState } from './mtn-attempt';
import type { MtnAttempt } from './mtn-attempts.store';
import type { ProcessorResult } from '../processors/processor.service';

export interface MtnStatusBody {
  amount?: string;
  currency?: string;
  externalId?: string;
  financialTransactionId?: string;
  status?: string; // SUCCESSFUL | PENDING | FAILED
  reason?: string | { code?: string; message?: string };
}

export function mtnStatus(body: MtnStatusBody): string | undefined {
  return body.status;
}

export function mtnFinancialId(body: MtnStatusBody): string | null {
  return body.financialTransactionId ?? null;
}

export function mtnReason(body: MtnStatusBody): string | null {
  const r = body.reason;
  if (!r) return null;
  return typeof r === 'string' ? r : (r.code ?? r.message ?? null);
}

/** MTN wants the full international MSISDN as partyId (Zambia: 260XXXXXXXXX). */
export function mtnPartyId(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.startsWith('260')) return d;
  if (d.length === 10 && d.startsWith('0')) return '260' + d.slice(1);
  if (d.length === 9) return '260' + d;
  return d;
}

export function summarize(body: MtnStatusBody): Record<string, unknown> {
  return {
    status: body.status,
    financialTransactionId: body.financialTransactionId,
    reason: mtnReason(body),
  };
}

export interface AttemptOutcome {
  attemptId: string;
  mtnRefId: string;
  state: AttemptState;
  financialTransactionId: string | null;
  reason: string | null;
}

export function asOutcome(a: MtnAttempt): AttemptOutcome {
  return {
    attemptId: a.id,
    mtnRefId: a.mtnRefId,
    state: a.state,
    financialTransactionId: a.financialTransactionId,
    reason: a.reason,
  };
}

export function attemptToProcessorResult(o: AttemptOutcome): ProcessorResult | null {
  if (o.state === 'SUCCESS') {
    return { status: 'SUCCESS', reference: o.financialTransactionId ?? o.mtnRefId };
  }
  if (o.state === 'FAILED') {
    return {
      status: 'FAILED',
      reference: o.financialTransactionId ?? o.mtnRefId,
      failureReason: o.reason ?? 'MTN_DECLINED',
    };
  }
  return null;
}

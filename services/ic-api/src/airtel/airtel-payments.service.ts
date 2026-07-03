// Airtel Collections (§2 USSD push) + Transaction Enquiry (§3).
//
// initiateCollection() creates an attempt, POSTs the USSD push, and records the
// interim state. A timeout becomes UNKNOWN (never assumed-failed) so the caller
// can enquire. enquire() polls final status (TS = success), persists the
// airtel_money_id, and resolves the attempt. toProcessorResult() maps a resolved
// attempt onto the engine's ProcessorResult so the existing
// TransactionService.completeTransaction() finalises the business transaction.

import { AirtelError } from './airtel.errors';
import { ngweeToKwacha } from './money';
import { airtelTxnId, isFinalAttemptState, mapAirtelStatus, type AttemptState } from './airtel-attempt';
import {
  asOutcome,
  attemptToProcessorResult,
  moneyId,
  sanitizeReference,
  statusCode,
  summarize,
  zmSubscriberMsisdn,
  type AirtelTxnBody,
  type AttemptOutcome,
} from './airtel-response';
import type { AirtelAttemptStore } from './airtel-attempts.store';
import type { AirtelResponse } from './airtel.client';
import type { AirtelEnvConfig, AirtelGlobalConfig } from './airtel.config';
import type { ProcessorResult } from '../processors/processor.service';

interface AirtelHttp {
  get<T = unknown>(path: string): Promise<AirtelResponse<T>>;
  post<T = unknown>(path: string, body: unknown): Promise<AirtelResponse<T>>;
}

export { zmSubscriberMsisdn } from './airtel-response';
export type { AttemptOutcome } from './airtel-response';

export interface CollectionInput {
  transactionId: string;
  msisdn: string;
  amountNgwee: bigint;
  reference: string;
}

export class AirtelPaymentsService {
  constructor(
    private readonly http: AirtelHttp,
    private readonly store: AirtelAttemptStore,
    private readonly config: () => AirtelEnvConfig,
    private readonly global: () => AirtelGlobalConfig,
  ) {}

  /** §2: initiate a USSD-push collection. Idempotent-safe: unique id per attempt. */
  async initiateCollection(input: CollectionInput): Promise<AttemptOutcome> {
    const cfg = this.config();
    const g = this.global();
    const attemptNo = (await this.store.latestAttemptNo(input.transactionId)) + 1;
    const id = airtelTxnId(input.transactionId, attemptNo);

    const attempt = await this.store.create({
      transactionId: input.transactionId,
      direction: 'COLLECTION',
      airtelEnv: cfg.env,
      msisdn: zmSubscriberMsisdn(input.msisdn),
      amountNgwee: input.amountNgwee,
      airtelTxnId: id,
      attemptNo,
    });

    const requestBody = {
      reference: sanitizeReference(input.reference),
      subscriber: { country: g.country, currency: g.currency, msisdn: zmSubscriberMsisdn(input.msisdn) },
      transaction: { amount: ngweeToKwacha(input.amountNgwee), country: g.country, currency: g.currency, id },
    };

    let res: AirtelResponse<AirtelTxnBody>;
    try {
      res = await this.http.post<AirtelTxnBody>('/merchant/v1/payments/', requestBody);
    } catch (e) {
      if (e instanceof AirtelError && e.indeterminate) {
        // Timeout/5xx: the push MAY have gone through — do NOT assume failure.
        return this.finish(attempt.id, {
          to: 'UNKNOWN',
          source: 'API',
          detail: { kind: e.kind, message: e.message, requestId: e.meta.requestId },
        });
      }
      const err = e instanceof AirtelError ? e : new AirtelError('UNKNOWN', String(e));
      return this.finish(attempt.id, {
        to: 'FAILED',
        source: 'API',
        failureReason: err.kind,
        detail: { message: err.message, resultCode: err.meta.resultCode, requestId: err.meta.requestId },
      });
    }

    // Accepted: record INITIATED, then interpret the (possibly interim) status.
    await this.store.transition(attempt.id, {
      to: 'INITIATED',
      source: 'API',
      requestId: res.requestId,
      resultCode: res.resultCode ?? null,
      detail: summarize(res.body),
    });
    const mapped = mapAirtelStatus(statusCode(res.body));
    const to: AttemptState = mapped === 'PENDING' ? 'PENDING' : mapped;
    return this.finish(attempt.id, {
      to,
      source: 'API',
      airtelMoneyId: moneyId(res.body),
      failureReason: to === 'FAILED' ? (statusCode(res.body) ?? 'AIRTEL_DECLINED') : null,
      detail: summarize(res.body),
    });
  }

  /** §3: enquire final status. Idempotent — a resolved attempt is returned as-is. */
  async enquire(id: string): Promise<AttemptOutcome> {
    const attempt = await this.store.findByAirtelTxnId(id);
    if (!attempt) throw new AirtelError('UNKNOWN', `unknown airtel attempt: ${id}`);
    if (isFinalAttemptState(attempt.state)) return asOutcome(attempt);

    const res = await this.http.get<AirtelTxnBody>(`/standard/v1/payments/${id}`);
    const mapped = mapAirtelStatus(statusCode(res.body));
    const airtelMoneyId = moneyId(res.body) ?? attempt.airtelMoneyId;

    if (mapped === 'PENDING') {
      // Still not final. Advance to PENDING if we can; otherwise leave as-is.
      if (attempt.state !== 'PENDING') {
        return this.finish(attempt.id, { to: 'PENDING', source: 'ENQUIRY', airtelMoneyId, detail: summarize(res.body) });
      }
      return asOutcome({ ...attempt, airtelMoneyId });
    }
    return this.finish(attempt.id, {
      to: mapped,
      source: 'ENQUIRY',
      airtelMoneyId,
      failureReason: mapped === 'FAILED' ? (statusCode(res.body) ?? 'AIRTEL_DECLINED') : null,
      detail: summarize(res.body),
    });
  }

  /** Map a resolved attempt to a ProcessorResult; null if not final yet. */
  toProcessorResult(o: AttemptOutcome): ProcessorResult | null {
    return attemptToProcessorResult(o);
  }

  private async finish(
    attemptId: string,
    patch: Parameters<AirtelAttemptStore['transition']>[1],
  ): Promise<AttemptOutcome> {
    return asOutcome(await this.store.transition(attemptId, patch));
  }
}

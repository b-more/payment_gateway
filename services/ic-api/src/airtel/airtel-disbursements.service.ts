// Airtel Disbursements (§4 — B2C payout). Mirrors the collection flow (attempt +
// state machine + UNKNOWN handling) but:
//   - encrypts the wallet PIN (RSA) per request; the PIN is never logged/stored,
//   - requires an approvalRef (disbursements move money out — the gateway layer
//     enforces human approval; we refuse to dispatch without one — fail safe),
//   - persists BOTH our airtel_txn_id and every Airtel reference, because the
//     disbursement response is known to echo a TRUNCATED transaction id.

import { AirtelError } from './airtel.errors';
import { encryptPin } from './airtel.crypto';
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
import { assertAirtelCredentials, type AirtelEnvConfig } from './airtel.config';
import type { AirtelAttemptStore } from './airtel-attempts.store';
import type { AirtelResponse } from './airtel.client';
import type { ProcessorResult } from '../processors/processor.service';

interface AirtelHttp {
  get<T = unknown>(path: string): Promise<AirtelResponse<T>>;
  post<T = unknown>(path: string, body: unknown): Promise<AirtelResponse<T>>;
}

export interface DisbursementInput {
  transactionId: string;
  payeeMsisdn: string;
  amountNgwee: bigint;
  reference: string;
  /** Proof the gateway's human-approval (maker-checker) gate was satisfied. */
  approvalRef: string;
}

export class AirtelDisbursementsService {
  constructor(
    private readonly http: AirtelHttp,
    private readonly store: AirtelAttemptStore,
    private readonly config: () => AirtelEnvConfig,
  ) {}

  /** §4: initiate a B2C payout. Refuses to dispatch without an approvalRef. */
  async initiateDisbursement(input: DisbursementInput): Promise<AttemptOutcome> {
    if (!input.approvalRef || input.approvalRef.trim() === '') {
      throw new Error('disbursement requires an approvalRef (human approval not recorded)');
    }
    const cfg = this.config();
    assertAirtelCredentials(cfg);
    if (!cfg.disbursePin || !cfg.publicKeyBase64) {
      throw new Error('disbursement config incomplete: PIN and/or public key not set');
    }
    const attemptNo = (await this.store.latestAttemptNo(input.transactionId)) + 1;
    const id = airtelTxnId(input.transactionId, attemptNo);
    const payee = zmSubscriberMsisdn(input.payeeMsisdn);

    const attempt = await this.store.create({
      transactionId: input.transactionId,
      direction: 'DISBURSEMENT',
      airtelEnv: cfg.env,
      msisdn: payee,
      amountNgwee: input.amountNgwee,
      airtelTxnId: id,
      attemptNo,
    });

    // Encrypt the PIN per request; the plaintext and ciphertext never leave here.
    const requestBody = {
      payee: { msisdn: payee, wallet_type: 'NORMAL' },
      reference: sanitizeReference(input.reference),
      pin: encryptPin(cfg.disbursePin, cfg.publicKeyBase64),
      transaction: { amount: ngweeToKwacha(input.amountNgwee), id, type: 'B2C' },
    };

    let res: AirtelResponse<AirtelTxnBody>;
    try {
      res = await this.http.post<AirtelTxnBody>('/standard/v3/disbursements', requestBody);
    } catch (e) {
      if (e instanceof AirtelError && e.indeterminate) {
        return this.finish(attempt.id, {
          to: 'UNKNOWN',
          source: 'API',
          // approvalRef recorded; PIN is never included in the detail.
          detail: { kind: e.kind, message: e.message, approvalRef: input.approvalRef, requestId: e.meta.requestId },
        });
      }
      const err = e instanceof AirtelError ? e : new AirtelError('UNKNOWN', String(e));
      return this.finish(attempt.id, {
        to: 'FAILED',
        source: 'API',
        failureReason: err.kind,
        detail: { message: err.message, resultCode: err.meta.resultCode, approvalRef: input.approvalRef },
      });
    }

    await this.store.transition(attempt.id, {
      to: 'INITIATED',
      source: 'API',
      requestId: res.requestId,
      resultCode: res.resultCode ?? null,
      // Persist our id + the (possibly truncated) echoed id + airtel_money_id.
      detail: { ...summarize(res.body), approvalRef: input.approvalRef, echoedId: res.body.data?.transaction?.id },
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

  /**
   * §4: disbursement status enquiry. GET /standard/v1/disbursements/{id}. The id
   * format Airtel accepts here is ambiguous (it echoes a truncated id), so this
   * enquires by OUR full airtel_txn_id and, on a NO_ROUTE, is structured to allow
   * an alternate id later. Idempotent once final.
   */
  async enquireDisbursement(id: string): Promise<AttemptOutcome> {
    const attempt = await this.store.findByAirtelTxnId(id);
    if (!attempt) throw new AirtelError('UNKNOWN', `unknown airtel disbursement attempt: ${id}`);
    if (isFinalAttemptState(attempt.state)) return asOutcome(attempt);

    const res = await this.http.get<AirtelTxnBody>(`/standard/v1/disbursements/${id}`);
    const mapped = mapAirtelStatus(statusCode(res.body));
    const airtelMoneyId = moneyId(res.body) ?? attempt.airtelMoneyId;

    if (mapped === 'PENDING') {
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

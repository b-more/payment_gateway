// MTN Disbursements — Transfer (§ disbursement). POST /disbursement/v1_0/transfer
// (202, empty body) then GET /disbursement/v1_0/transfer/{X-Reference-Id}. No PIN
// — auth is the disbursement product's apiUser/apiKey. Requires an approvalRef
// (money out — the gateway's human-approval gate; refuse to dispatch without one).

import { MtnError } from './mtn.errors';
import { ngweeToAmount } from './money';
import { assertMtnProductCredentials, type MtnGlobalConfig, type MtnProductConfig } from './mtn.config';
import {
  canTransitionAttempt,
  isFinalAttemptState,
  mapMtnStatus,
  mtnRefId,
  type AttemptState,
} from './mtn-attempt';
import {
  asOutcome,
  attemptToProcessorResult,
  mtnFinancialId,
  mtnPartyId,
  mtnReason,
  mtnStatus,
  summarize,
  type AttemptOutcome,
  type MtnStatusBody,
} from './mtn-response';
import type { MtnAttemptStore } from './mtn-attempts.store';
import type { MtnRequestOptions, MtnResponse } from './mtn.client';
import type { ProcessorResult } from '../processors/processor.service';

interface MtnHttp {
  get<T = unknown>(path: string): Promise<MtnResponse<T>>;
  post<T = unknown>(path: string, opts: MtnRequestOptions): Promise<MtnResponse<T>>;
}

export interface DisbursementInput {
  transactionId: string;
  payeeMsisdn: string;
  amountNgwee: bigint;
  externalId: string;
  approvalRef: string;
}

export class MtnDisbursementsService {
  constructor(
    private readonly http: MtnHttp,
    private readonly store: MtnAttemptStore,
    private readonly config: () => MtnProductConfig,
    private readonly global: () => MtnGlobalConfig,
  ) {}

  async initiateDisbursement(input: DisbursementInput): Promise<AttemptOutcome> {
    if (!input.approvalRef || input.approvalRef.trim() === '') {
      throw new Error('disbursement requires an approvalRef (human approval not recorded)');
    }
    const cfg = this.config();
    assertMtnProductCredentials(cfg);
    const g = this.global();
    const partyId = mtnPartyId(input.payeeMsisdn);
    const attemptNo = (await this.store.latestAttemptNo(input.transactionId)) + 1;
    const refId = mtnRefId();

    const attempt = await this.store.create({
      transactionId: input.transactionId,
      direction: 'DISBURSEMENT',
      mtnEnv: cfg.env,
      msisdn: partyId,
      amountNgwee: input.amountNgwee,
      mtnRefId: refId,
      externalId: input.externalId,
      attemptNo,
    });

    const body = {
      amount: ngweeToAmount(input.amountNgwee),
      currency: g.currency,
      externalId: input.externalId,
      payee: { partyIdType: 'MSISDN', partyId },
      payerMessage: 'Payout',
      payeeNote: 'Disbursement',
    };

    try {
      const res = await this.http.post('/disbursement/v1_0/transfer', { body, referenceId: refId });
      await this.store.transition(attempt.id, {
        to: 'INITIATED',
        source: 'API',
        detail: { httpStatus: res.httpStatus, approvalRef: input.approvalRef },
      });
      return this.finish(attempt.id, { to: 'PENDING', source: 'API' });
    } catch (e) {
      if (e instanceof MtnError && e.indeterminate) {
        return this.finish(attempt.id, {
          to: 'UNKNOWN',
          source: 'API',
          detail: { kind: e.kind, message: e.message, approvalRef: input.approvalRef },
        });
      }
      const err = e instanceof MtnError ? e : new MtnError('UNKNOWN', String(e));
      return this.finish(attempt.id, {
        to: 'FAILED',
        source: 'API',
        reason: err.kind,
        detail: { message: err.message, code: err.meta.code, approvalRef: input.approvalRef },
      });
    }
  }

  async status(refId: string): Promise<AttemptOutcome> {
    const attempt = await this.store.findByRefId(refId);
    if (!attempt) throw new MtnError('UNKNOWN', `unknown mtn disbursement attempt: ${refId}`);
    if (isFinalAttemptState(attempt.state)) return asOutcome(attempt);

    const res = await this.http.get<MtnStatusBody>(`/disbursement/v1_0/transfer/${refId}`);
    const mapped = mapMtnStatus(mtnStatus(res.body));
    const finId = mtnFinancialId(res.body) ?? attempt.financialTransactionId;

    if (mapped === 'PENDING') {
      if (attempt.state !== 'PENDING' && canTransitionAttempt(attempt.state, 'PENDING')) {
        return this.finish(attempt.id, { to: 'PENDING', source: 'STATUS', financialTransactionId: finId, detail: summarize(res.body) });
      }
      return asOutcome({ ...attempt, financialTransactionId: finId });
    }
    const to: AttemptState = mapped;
    return this.finish(attempt.id, {
      to,
      source: 'STATUS',
      financialTransactionId: finId,
      reason: to === 'FAILED' ? mtnReason(res.body) : null,
      detail: summarize(res.body),
    });
  }

  toProcessorResult(o: AttemptOutcome): ProcessorResult | null {
    return attemptToProcessorResult(o);
  }

  private async finish(
    attemptId: string,
    patch: Parameters<MtnAttemptStore['transition']>[1],
  ): Promise<AttemptOutcome> {
    return asOutcome(await this.store.transition(attemptId, patch));
  }
}

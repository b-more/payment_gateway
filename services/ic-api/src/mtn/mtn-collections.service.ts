// MTN Collections — Request To Pay (§ collection). POST /collection/v1_0/requesttopay
// returns 202 with an empty body, so an attempt is always PENDING after initiate;
// the final result comes from GET /collection/v1_0/requesttopay/{X-Reference-Id}.

import { MtnError } from './mtn.errors';
import { ngweeToAmount } from './money';
import {
  assertMtnProductCredentials,
  type MtnGlobalConfig,
  type MtnProductConfig,
} from './mtn.config';
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

export interface CollectionInput {
  transactionId: string;
  msisdn: string;
  amountNgwee: bigint;
  externalId: string;
}

export class MtnCollectionsService {
  constructor(
    private readonly http: MtnHttp,
    private readonly store: MtnAttemptStore,
    private readonly config: () => MtnProductConfig,
    private readonly global: () => MtnGlobalConfig,
  ) {}

  async initiateCollection(input: CollectionInput): Promise<AttemptOutcome> {
    const cfg = this.config();
    assertMtnProductCredentials(cfg);
    const g = this.global();
    const partyId = mtnPartyId(input.msisdn);
    const attemptNo = (await this.store.latestAttemptNo(input.transactionId)) + 1;
    const refId = mtnRefId();

    const attempt = await this.store.create({
      transactionId: input.transactionId,
      direction: 'COLLECTION',
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
      payer: { partyIdType: 'MSISDN', partyId },
      payerMessage: 'Payment',
      payeeNote: 'Collection',
    };

    try {
      const res = await this.http.post('/collection/v1_0/requesttopay', { body, referenceId: refId });
      await this.store.transition(attempt.id, { to: 'INITIATED', source: 'API', detail: { httpStatus: res.httpStatus } });
      return this.finish(attempt.id, { to: 'PENDING', source: 'API' });
    } catch (e) {
      if (e instanceof MtnError && e.indeterminate) {
        return this.finish(attempt.id, { to: 'UNKNOWN', source: 'API', detail: { kind: e.kind, message: e.message } });
      }
      const err = e instanceof MtnError ? e : new MtnError('UNKNOWN', String(e));
      return this.finish(attempt.id, {
        to: 'FAILED',
        source: 'API',
        reason: err.kind,
        detail: { message: err.message, code: err.meta.code },
      });
    }
  }

  async status(refId: string): Promise<AttemptOutcome> {
    const attempt = await this.store.findByRefId(refId);
    if (!attempt) throw new MtnError('UNKNOWN', `unknown mtn collection attempt: ${refId}`);
    if (isFinalAttemptState(attempt.state)) return asOutcome(attempt);

    const res = await this.http.get<MtnStatusBody>(`/collection/v1_0/requesttopay/${refId}`);
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

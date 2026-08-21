// Bridge between the Airtel processor services and the money engine. Initiates
// collections/disbursements for a PROCESSING transaction, and resolves attempts
// (from a callback or the reconciliation job) by applying the outcome to the
// existing TransactionService.completeTransaction (which is idempotent, so
// callbacks and polling coexist safely — first terminal signal wins).

import { Injectable } from '@nestjs/common';
import { AirtelPaymentsService } from './airtel-payments.service';
import { AirtelDisbursementsService } from './airtel-disbursements.service';
import { AirtelAttemptsRepository } from './airtel-attempts.repository';
import type { AttemptOutcome } from './airtel-response';
import { TransactionService } from '../transactions/transaction.service';
import type { ProcessorResult } from '../processors/processor.service';

export interface DispatchTxn {
  id: string;
  msisdn: string;
  amountNgwee: bigint;
  reference: string;
}

@Injectable()
export class AirtelDispatchService {
  constructor(
    private readonly payments: AirtelPaymentsService,
    private readonly disbursements: AirtelDisbursementsService,
    private readonly attempts: AirtelAttemptsRepository,
    private readonly txns: TransactionService,
  ) {}

  /**
   * True when this transaction already has a live (non-FAILED) attempt — i.e. a
   * prompt has already gone to the customer. Used to make dispatch idempotent so
   * a retried `POST /collections` (same Idempotency-Key) never re-prompts.
   */
  async hasLiveAttempt(transactionId: string): Promise<boolean> {
    const a = await this.attempts.findLatestByTransactionId(transactionId);
    return !!a && a.state !== 'FAILED';
  }

  /** Initiate a collection for a PROCESSING transaction; resolve now if final. */
  async dispatchCollection(txn: DispatchTxn): Promise<AttemptOutcome> {
    const outcome = await this.payments.initiateCollection({
      transactionId: txn.id,
      msisdn: txn.msisdn,
      amountNgwee: txn.amountNgwee,
      reference: txn.reference,
    });
    await this.applyIfFinal(txn.id, this.payments.toProcessorResult(outcome));
    return outcome;
  }

  /** Initiate a B2C disbursement (requires a human approvalRef); resolve if final. */
  async dispatchDisbursement(txn: DispatchTxn, approvalRef: string): Promise<AttemptOutcome> {
    const outcome = await this.disbursements.initiateDisbursement({
      transactionId: txn.id,
      payeeMsisdn: txn.msisdn,
      amountNgwee: txn.amountNgwee,
      reference: txn.reference,
      approvalRef,
    });
    await this.applyIfFinal(txn.id, this.disbursements.toProcessorResult(outcome));
    return outcome;
  }

  /** Resolve-on-read: re-enquire the latest attempt for a transaction, if any. */
  async resolveByTransactionId(transactionId: string): Promise<void> {
    const attempt = await this.attempts.findLatestByTransactionId(transactionId);
    if (attempt && attempt.state !== 'SUCCESS' && attempt.state !== 'FAILED') {
      await this.resolveByAirtelTxnId(attempt.airtelTxnId);
    }
  }

  /** Re-enquire an attempt (callback / reconcile) and resolve the transaction. */
  async resolveByAirtelTxnId(airtelTxnId: string): Promise<AttemptOutcome | null> {
    const attempt = await this.attempts.findByAirtelTxnId(airtelTxnId);
    if (!attempt) return null;
    const outcome =
      attempt.direction === 'COLLECTION'
        ? await this.payments.enquire(airtelTxnId)
        : await this.disbursements.enquireDisbursement(airtelTxnId);
    const result =
      attempt.direction === 'COLLECTION'
        ? this.payments.toProcessorResult(outcome)
        : this.disbursements.toProcessorResult(outcome);
    if (attempt.transactionId) await this.applyIfFinal(attempt.transactionId, result);
    return outcome;
  }

  /** Resolve from a callback that may carry our id and/or Airtel's money id. */
  async resolveFromCallback(ref: { ourId?: string | null; moneyId?: string | null }): Promise<boolean> {
    let airtelTxnId = ref.ourId ?? null;
    if (!airtelTxnId && ref.moneyId) {
      const byMoney = await this.attempts.findByAirtelMoneyId(ref.moneyId);
      airtelTxnId = byMoney?.airtelTxnId ?? null;
    }
    if (!airtelTxnId) return false;
    const outcome = await this.resolveByAirtelTxnId(airtelTxnId);
    return outcome !== null;
  }

  private async applyIfFinal(transactionId: string, result: ProcessorResult | null): Promise<void> {
    if (result) await this.txns.completeTransaction({ transactionId, result });
  }
}

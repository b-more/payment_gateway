// Bridge between the MTN services and the money engine. Mirrors the Airtel
// dispatch: initiate for a PROCESSING transaction, and resolve attempts (status
// poll / reconcile) by applying the outcome to the idempotent completeTransaction.

import { Injectable } from '@nestjs/common';
import { MtnCollectionsService } from './mtn-collections.service';
import { MtnDisbursementsService } from './mtn-disbursements.service';
import { MtnAttemptsRepository } from './mtn-attempts.repository';
import type { AttemptOutcome } from './mtn-response';
import { TransactionService } from '../transactions/transaction.service';
import type { ProcessorResult } from '../processors/processor.service';

export interface DispatchTxn {
  id: string;
  msisdn: string;
  amountNgwee: bigint;
  externalId: string;
}

@Injectable()
export class MtnDispatchService {
  constructor(
    private readonly collections: MtnCollectionsService,
    private readonly disbursements: MtnDisbursementsService,
    private readonly attempts: MtnAttemptsRepository,
    private readonly txns: TransactionService,
  ) {}

  /** True when a live (non-FAILED) attempt already exists — see AirtelDispatchService. */
  async hasLiveAttempt(transactionId: string): Promise<boolean> {
    const a = await this.attempts.findLatestByTransactionId(transactionId);
    return !!a && a.state !== 'FAILED';
  }

  async dispatchCollection(txn: DispatchTxn): Promise<AttemptOutcome> {
    const outcome = await this.collections.initiateCollection({
      transactionId: txn.id,
      msisdn: txn.msisdn,
      amountNgwee: txn.amountNgwee,
      externalId: txn.externalId,
    });
    await this.applyIfFinal(txn.id, this.collections.toProcessorResult(outcome));
    return outcome;
  }

  async dispatchDisbursement(txn: DispatchTxn, approvalRef: string): Promise<AttemptOutcome> {
    const outcome = await this.disbursements.initiateDisbursement({
      transactionId: txn.id,
      payeeMsisdn: txn.msisdn,
      amountNgwee: txn.amountNgwee,
      externalId: txn.externalId,
      approvalRef,
    });
    await this.applyIfFinal(txn.id, this.disbursements.toProcessorResult(outcome));
    return outcome;
  }

  async resolveByRefId(refId: string): Promise<AttemptOutcome | null> {
    const attempt = await this.attempts.findByRefId(refId);
    if (!attempt) return null;
    const outcome =
      attempt.direction === 'COLLECTION'
        ? await this.collections.status(refId)
        : await this.disbursements.status(refId);
    const result =
      attempt.direction === 'COLLECTION'
        ? this.collections.toProcessorResult(outcome)
        : this.disbursements.toProcessorResult(outcome);
    if (attempt.transactionId) await this.applyIfFinal(attempt.transactionId, result);
    return outcome;
  }

  async resolveByTransactionId(transactionId: string): Promise<void> {
    const attempt = await this.attempts.findLatestByTransactionId(transactionId);
    if (attempt && attempt.state !== 'SUCCESS' && attempt.state !== 'FAILED') {
      await this.resolveByRefId(attempt.mtnRefId);
    }
  }

  private async applyIfFinal(transactionId: string, result: ProcessorResult | null): Promise<void> {
    if (result) await this.txns.completeTransaction({ transactionId, result });
  }
}

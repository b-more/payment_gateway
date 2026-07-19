import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { isUniqueViolation, withTransaction } from '../database/tx';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { ProcessorService, type ProcessorResult } from '../processors/processor.service';
import { WebhookService } from '../webhooks/webhook.service';
import { computeAmounts, type ChargeConfig } from '../money/charges';
import { assertTransition } from '../money/state-machine';
import {
  AccountNotLiveError,
  ConfigurationError,
  DuplicateRequestError,
  NotFoundError,
} from '../money/errors';
import { parsePercentToScaled } from '../money/money';
import type {
  ChargeFulfiller,
  OperatingMode,
  Processor,
  TransactionStatus,
  TransactionType,
} from '../money/types';

export interface ProcessTransactionInput {
  accountId: string;
  type: TransactionType;
  processor: Processor;
  amount: bigint; // ngwee
  msisdn?: string | null;
  idempotencyKey: string; // IDEM-1
  collectionReference?: string | null;
  environment: OperatingMode;
  actorId?: string | null;
}

export interface TransactionRecord {
  id: string;
  accountId: string;
  type: TransactionType;
  processor: Processor;
  msisdn: string | null;
  amount: bigint;
  charge: bigint;
  netAmount: bigint;
  status: TransactionStatus;
  failureReason: string | null;
  idempotencyKey: string;
  collectionReference: string | null;
  environment: OperatingMode;
}

interface TxnRow {
  id: string;
  account_id: string;
  type: TransactionType;
  processor: Processor;
  msisdn: string | null;
  amount: string;
  charge: string;
  net_amount: string;
  status: TransactionStatus;
  failure_reason: string | null;
  idempotency_key: string;
  collection_reference: string | null;
  environment: OperatingMode;
}
interface AccountRow {
  operating_mode: OperatingMode;
  float_balance: string;
  status: string;
}
interface ChargeConfigRow {
  charge_type: ChargeConfig['chargeType'];
  charge_fulfiller: ChargeFulfiller;
  fixed_value: string | null;
  percent_value: string | null;
}

function mapTxn(row: TxnRow): TransactionRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    type: row.type,
    processor: row.processor,
    msisdn: row.msisdn,
    amount: BigInt(row.amount),
    charge: BigInt(row.charge),
    netAmount: BigInt(row.net_amount),
    status: row.status,
    failureReason: row.failure_reason,
    idempotencyKey: row.idempotency_key,
    collectionReference: row.collection_reference,
    environment: row.environment,
  };
}

/**
 * Transaction processing (§5.3), idempotency (§5.6) and the reversal path
 * (STATE-3). Every float-mutating step runs under a row lock inside one
 * transaction (TXN-1) and is idempotent on (account_id, idempotency_key).
 */
@Injectable()
export class TransactionService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly processor: ProcessorService,
    private readonly webhooks: WebhookService,
  ) {}

  private static isFinal(status: TransactionStatus): boolean {
    return (
      status === 'SUCCESS' ||
      status === 'FAILED' ||
      status === 'REVERSED' ||
      status === 'EXPIRED'
    );
  }

  /**
   * Begin a collection/disbursement. Locks the account, computes the charge,
   * checks float (TXN-2), debits via the ledger (TXN-3) and records a PROCESSING
   * transaction — or a FAILED one on insufficient float. Idempotent: a repeated
   * key returns the original record without reprocessing (IDEM-2).
   */
  async processTransaction(input: ProcessTransactionInput): Promise<TransactionRecord> {
    const prior = await this.findByIdempotencyKey(this.pool, input.accountId, input.idempotencyKey);
    if (prior) return this.reconcileIdempotent(prior, input); // IDEM-2 (replay, no new webhook)

    let outcome: { record: TransactionRecord; created: boolean };
    try {
      outcome = await withTransaction(this.pool, async (client) => {
        const duplicate = await this.findByIdempotencyKey(
          client,
          input.accountId,
          input.idempotencyKey,
        );
        if (duplicate) return { record: this.reconcileIdempotent(duplicate, input), created: false };

        // Lock the account row for the whole operation (TXN-1).
        const accountResult = await client.query<AccountRow>(
          'SELECT operating_mode, float_balance, status FROM accounts WHERE id = $1 FOR UPDATE',
          [input.accountId],
        );
        if (accountResult.rowCount === 0) {
          throw new ConfigurationError(`account not found: ${input.accountId}`);
        }
        const account = accountResult.rows[0];
        const balance = BigInt(account.float_balance);

        // TXN-6: a PRODUCTION transaction needs a live (PRODUCTION-mode) account.
        // Liveness is NOT about money: collecting is how a merchant earns float,
        // so requiring a balance here would lock out every new merchant. A payout
        // that can't be covered is handled below as FAILED/INSUFFICIENT_FLOAT —
        // a recorded outcome with a reason, rather than a thrown error.
        if (input.environment === 'PRODUCTION' && account.operating_mode !== 'PRODUCTION') {
          throw new AccountNotLiveError();
        }

        const config = await this.loadChargeConfig(client, input.accountId, input.processor);
        const amounts = computeAmounts(config.charge, config.fulfiller, input.amount);

        // TXN-2: insufficient float -> FAILED, no debit. Only a DISBURSEMENT
        // spends float; a collection brings money IN and needs none. Float is a
        // PRODUCTION concept only — SANDBOX is isolated from the real ledger.
        if (
          input.environment === 'PRODUCTION' &&
          input.type === 'DISBURSEMENT' &&
          balance < amounts.required
        ) {
          const failed = await this.insertTransaction(client, input, {
            charge: amounts.charge,
            netAmount: amounts.netAmount,
            status: 'FAILED',
            failureReason: 'INSUFFICIENT_FLOAT',
          });
          await this.audit.write(client, {
            actorId: input.actorId ?? null,
            actorScope: 'SYSTEM',
            action: 'TRANSACTION_FAILED',
            target: failed.id,
            metadata: { reason: 'INSUFFICIENT_FLOAT', required: amounts.required.toString() },
          });
          return { record: failed, created: true };
        }

        // TXN-3: mark PROCESSING. A DISBURSEMENT reserves the money now by
        // debiting float (refunded if it fails). A COLLECTION debits nothing —
        // it CREDITS the merchant's net once it actually succeeds, in
        // completeTransaction. SANDBOX skips the ledger entirely.
        const txn = await this.insertTransaction(client, input, {
          charge: amounts.charge,
          netAmount: amounts.netAmount,
          status: 'PROCESSING',
          failureReason: null,
        });
        if (input.environment === 'PRODUCTION' && input.type === 'DISBURSEMENT') {
          await this.ledger.append(client, {
            accountId: input.accountId,
            entryType: 'DEBIT',
            amount: amounts.required,
            counterparty: `PROCESSOR_${input.processor}`,
            reference: txn.id,
            createdBy: input.actorId ?? null,
          });
        }
        await this.audit.write(client, {
          actorId: input.actorId ?? null,
          actorScope: 'SYSTEM',
          action: 'TRANSACTION_PROCESSING',
          target: txn.id,
          metadata: {
            amount: amounts.amount.toString(),
            charge: amounts.charge.toString(),
            required: amounts.required.toString(),
          },
        });
        return { record: txn, created: true };
      });
    } catch (error) {
      // Concurrent duplicate key: return the row the winning request created (IDEM-2).
      if (isUniqueViolation(error)) {
        const existing = await this.findByIdempotencyKey(
          this.pool,
          input.accountId,
          input.idempotencyKey,
        );
        if (existing) return this.reconcileIdempotent(existing, input);
      }
      throw error;
    }

    // WH-1: enqueue only for a freshly created final state (e.g. INSUFFICIENT_FLOAT).
    if (outcome.created && TransactionService.isFinal(outcome.record.status)) {
      await this.webhooks.enqueue(outcome.record.id, outcome.record.status);
    }
    return outcome.record;
  }

  // IDEM-2 with conflict detection: same key + same request -> original record;
  // same key + a DIFFERENT request -> DUPLICATE_REQUEST (§8).
  private reconcileIdempotent(
    existing: TransactionRecord,
    input: ProcessTransactionInput,
  ): TransactionRecord {
    const sameRequest =
      existing.type === input.type &&
      existing.processor === input.processor &&
      existing.amount === input.amount &&
      (existing.msisdn ?? null) === (input.msisdn ?? null);
    if (!sameRequest) {
      throw new DuplicateRequestError();
    }
    return existing;
  }

  /**
   * Convenience end-to-end path for SANDBOX: process the transaction, dispatch it
   * to the simulated processor (TXN-3/TXN-5), and apply the result. A FAILED
   * insufficient-float transaction is returned as-is (no dispatch).
   */
  async processAndSettle(input: ProcessTransactionInput): Promise<TransactionRecord> {
    const txn = await this.processTransaction(input);
    if (txn.status !== 'PROCESSING') return txn;
    const result = await this.processor.dispatch(txn.environment, txn.processor, {
      msisdn: input.msisdn ?? null,
      amount: txn.amount,
      reference: txn.id,
    });
    return this.completeTransaction({
      transactionId: txn.id,
      result,
      actorId: input.actorId ?? null,
    });
  }

  /**
   * Apply a processor outcome to a PROCESSING transaction (STATE: PROCESSING ->
   * SUCCESS|FAILED). On FAILED the debited float is refunded with a compensating
   * CREDIT so the ledger stays balanced.
   */
  async completeTransaction(input: {
    transactionId: string;
    result: ProcessorResult;
    actorId?: string | null;
  }): Promise<TransactionRecord> {
    const outcome = await withTransaction(this.pool, async (client) => {
      const current = await this.lockTransaction(client, input.transactionId);
      // Idempotent: a callback and a poll (or a retried callback) can both try to
      // resolve the same attempt — first one wins, later ones are no-ops.
      if (TransactionService.isFinal(current.status)) {
        return { record: current, resolved: false };
      }
      const next: TransactionStatus = input.result.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED';
      assertTransition(current.status, next); // STATE-2

      // Float movements (PRODUCTION only — SANDBOX never touches the ledger).
      if (current.environment === 'PRODUCTION') {
        if (next === 'SUCCESS' && current.type === 'COLLECTION') {
          // The customer paid: credit what the merchant nets after charges.
          // This is the merchant's income — settlement is what pays it out.
          await this.ledger.append(client, {
            accountId: current.accountId,
            entryType: 'CREDIT',
            amount: current.netAmount,
            counterparty: `PROCESSOR_${current.processor}`,
            reference: `COLLECTION:${current.id}`,
            createdBy: input.actorId ?? null,
          });
        }
        if (next === 'FAILED' && current.type === 'DISBURSEMENT') {
          // Refund the float the payout reserved at PROCESSING. A failed
          // collection debited nothing, so there is nothing to refund.
          await this.ledger.append(client, {
            accountId: current.accountId,
            entryType: 'CREDIT',
            amount: current.amount + current.charge,
            counterparty: `PROCESSOR_${current.processor}`,
            reference: `REFUND:${current.id}`,
            createdBy: input.actorId ?? null,
          });
        }
      }

      const updated = await this.updateStatus(
        client,
        current.id,
        next,
        next === 'FAILED' ? (input.result.failureReason ?? 'PROCESSOR_DECLINED') : null,
      );
      await this.audit.write(client, {
        actorId: input.actorId ?? null,
        actorScope: 'SYSTEM',
        action: next === 'SUCCESS' ? 'TRANSACTION_SUCCEEDED' : 'TRANSACTION_FAILED',
        target: current.id,
        metadata: { processorReference: input.result.reference },
      });
      return { record: updated, resolved: true };
    });
    // Only enqueue a webhook for the call that actually resolved the transaction.
    if (outcome.resolved) await this.webhooks.enqueue(outcome.record.id, outcome.record.status); // WH-1
    return outcome.record;
  }

  /** Admin reversal (§6.1.3): reverse any transaction by id (not account-scoped). */
  async reverseAsAdmin(input: {
    transactionId: string;
    actorId: string;
    reason?: string | null;
    ipAddress?: string | null;
  }): Promise<TransactionRecord> {
    const found = await this.pool.query<{ account_id: string }>(
      'SELECT account_id FROM transactions WHERE id = $1',
      [input.transactionId],
    );
    if (found.rowCount === 0) {
      throw new NotFoundError(`transaction not found: ${input.transactionId}`);
    }
    return this.reverseTransaction({ ...input, accountId: found.rows[0].account_id });
  }

  /** Read a transaction scoped to an account (NN-6/SEC-Z2 for the API). */
  async getForAccount(accountId: string, transactionId: string): Promise<TransactionRecord> {
    const result = await this.pool.query<TxnRow>(
      'SELECT * FROM transactions WHERE id = $1 AND account_id = $2',
      [transactionId, accountId],
    );
    if (result.rowCount === 0) {
      throw new NotFoundError(`transaction not found: ${transactionId}`);
    }
    return mapTxn(result.rows[0]);
  }

  /** Reverse a successful transaction (STATE-3): SUCCESS -> REVERSED + compensating CREDIT. */
  async reverseTransaction(input: {
    transactionId: string;
    accountId: string;
    actorId: string;
    reason?: string | null;
    ipAddress?: string | null;
  }): Promise<TransactionRecord> {
    const updated = await withTransaction(this.pool, async (client) => {
      const current = await this.lockTransaction(client, input.transactionId);
      if (current.accountId !== input.accountId) {
        throw new NotFoundError(`transaction not found: ${input.transactionId}`); // scope (NN-6)
      }
      assertTransition(current.status, 'REVERSED'); // only SUCCESS -> REVERSED

      // SANDBOX never touched the ledger, so a reversal has no float to move.
      // Direction mirrors what the success did: a reversed COLLECTION refunds
      // the customer, so we take back the net we credited; a reversed
      // DISBURSEMENT means the payout came back, so the float returns.
      if (current.environment === 'PRODUCTION') {
        const reversal =
          current.type === 'COLLECTION'
            ? { entryType: 'DEBIT' as const, amount: current.netAmount }
            : { entryType: 'CREDIT' as const, amount: current.amount + current.charge };
        await this.ledger.append(client, {
          accountId: current.accountId,
          ...reversal,
          counterparty: `PROCESSOR_${current.processor}`,
          reference: `REVERSAL:${current.id}`,
          createdBy: input.actorId,
        });
      }
      const updated = await this.updateStatus(client, current.id, 'REVERSED', null);
      await this.audit.write(client, {
        actorId: input.actorId ?? null,
        actorScope: 'SYSTEM',
        action: 'TRANSACTION_REVERSED',
        target: current.id,
        metadata: {
          restored: (current.amount + current.charge).toString(),
          ...(input.reason === undefined || input.reason === null ? {} : { reason: input.reason }),
        },
        ipAddress: input.ipAddress ?? null,
      });
      return updated;
    });
    await this.webhooks.enqueue(updated.id, updated.status); // WH-1 (REVERSED)
    return updated;
  }

  // ── helpers ──

  private async findByIdempotencyKey(
    runner: Pool | PoolClient,
    accountId: string,
    idempotencyKey: string,
  ): Promise<TransactionRecord | null> {
    const result = await runner.query<TxnRow>(
      'SELECT * FROM transactions WHERE account_id = $1 AND idempotency_key = $2',
      [accountId, idempotencyKey],
    );
    return result.rowCount === 0 ? null : mapTxn(result.rows[0]);
  }

  private async lockTransaction(
    client: PoolClient,
    transactionId: string,
  ): Promise<TransactionRecord> {
    const result = await client.query<TxnRow>(
      'SELECT * FROM transactions WHERE id = $1 FOR UPDATE',
      [transactionId],
    );
    if (result.rowCount === 0) {
      throw new ConfigurationError(`transaction not found: ${transactionId}`);
    }
    return mapTxn(result.rows[0]);
  }

  private async updateStatus(
    client: PoolClient,
    transactionId: string,
    status: TransactionStatus,
    failureReason: string | null,
  ): Promise<TransactionRecord> {
    const result = await client.query<TxnRow>(
      'UPDATE transactions SET status = $1, failure_reason = $2 WHERE id = $3 RETURNING *',
      [status, failureReason, transactionId],
    );
    return mapTxn(result.rows[0]);
  }

  private async insertTransaction(
    client: PoolClient,
    input: ProcessTransactionInput,
    derived: {
      charge: bigint;
      netAmount: bigint;
      status: TransactionStatus;
      failureReason: string | null;
    },
  ): Promise<TransactionRecord> {
    const result = await client.query<TxnRow>(
      `INSERT INTO transactions
         (account_id, type, processor, msisdn, amount, charge, net_amount, status,
          failure_reason, idempotency_key, collection_reference, environment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        input.accountId,
        input.type,
        input.processor,
        input.msisdn ?? null,
        input.amount.toString(),
        derived.charge.toString(),
        derived.netAmount.toString(),
        derived.status,
        derived.failureReason,
        input.idempotencyKey,
        input.collectionReference ?? null,
        input.environment,
      ],
    );
    return mapTxn(result.rows[0]);
  }

  private async loadChargeConfig(
    client: PoolClient,
    accountId: string,
    processor: Processor,
  ): Promise<{ charge: ChargeConfig; fulfiller: ChargeFulfiller }> {
    const result = await client.query<ChargeConfigRow>(
      `SELECT charge_type, charge_fulfiller, fixed_value, percent_value
         FROM charge_configs WHERE account_id = $1 AND processor = $2`,
      [accountId, processor],
    );
    if (result.rowCount === 0) {
      throw new ConfigurationError(`no charge config for ${processor} on account ${accountId}`);
    }
    const row = result.rows[0];
    return {
      fulfiller: row.charge_fulfiller,
      charge: {
        chargeType: row.charge_type,
        fixedValue: row.fixed_value === null ? 0n : BigInt(row.fixed_value),
        percentScaled: row.percent_value === null ? 0n : parsePercentToScaled(row.percent_value),
      },
    };
  }
}

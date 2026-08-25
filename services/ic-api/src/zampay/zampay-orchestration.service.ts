// ZamPay settlement orchestration — DB-driven, reconcile-job driven.
//
// The callback is an immediate PAYMENT confirmation: once we have collected the
// funds, we notify GSB (with our own payment reference) so the transaction is
// marked successful and the customer can complete. There is no operator step and
// no wait for money to reach the destination bank.
//
//   NEW          picked up from a successful collection
//   RESOLVED     invoice read; destination + amount known; callback pending
//   SETTLED      settlement callback acknowledged by GSB
//   FAILED       invoice read failed / callback exhausted retries
//   INVOICE_PAID invoice Paid but had no settleable services — nothing to send
//   (READY_TO_WIRE / WIRED remain in the enum but are unused — the wire step is gone)
//
// The reconcile job (run-zampay-reconcile) calls discoverPending() (pull model:
// pick up successful ZamPay-account collections) then resolvePending() then
// sendDueCallbacks(), all automatic. The collection hot path is untouched.

import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { withTransaction } from '../database/tx';
import { AuditService } from '../audit/audit.service';
import { ZampayInvoiceService, type ZampaySettlementGroup } from './zampay-invoice.service';
import { ZampaySettlementService } from './zampay-settlement.service';
import { ZampayError } from './zampay.errors';
import { NotFoundError } from '../money/errors';
import { zampayEnvConfig } from './zampay.config';

const MAX_CALLBACK_ATTEMPTS = 6;

@Injectable()
export class ZampayOrchestrationService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly invoices: ZampayInvoiceService,
    private readonly settlement: ZampaySettlementService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Discover successful collections on THE ONE pinned ZamPay account that have no
   * settlement instruction yet, and create a NEW row for each. A pull model
   * ("pick up all successful transactions registered on our collection
   * account"), so the collection hot path stays untouched and a missed pickup is
   * simply caught on the next run. Idempotent via the NOT EXISTS guard.
   *
   * Single-account by construction: the account number is pinned in config, so
   * nothing outside that one account is ever picked up. An empty pin (or the flag
   * turned off) discovers nothing.
   */
  async discoverPending(accountNumber: string): Promise<number> {
    if (!accountNumber) return 0;
    const res = await this.pool.query(
      `INSERT INTO zampay_settlements (transaction_id, account_id, zampay_reference, amount_ngwee, status, environment)
       SELECT t.id, t.account_id, COALESCE(t.collection_reference, ''), t.total_amount, 'NEW', $2
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         JOIN account_settings s ON s.account_id = t.account_id
        WHERE a.account_number = $1
          AND s.zampay_settlement_enabled = true
          AND t.type = 'COLLECTION' AND t.status = 'SUCCESS'
          AND COALESCE(t.collection_reference, '') <> ''
          AND NOT EXISTS (SELECT 1 FROM zampay_settlements z WHERE z.transaction_id = t.id)`,
      [accountNumber, zampayEnvConfig().env],
    );
    return res.rowCount ?? 0;
  }

  /** Resolve every NEW row: read its invoice, split into per-destination rows. */
  async resolvePending(): Promise<{ resolved: number; failed: number }> {
    const pending = await this.pool.query<{ id: string; transaction_id: string; account_id: string; zampay_reference: string }>(
      `SELECT id, transaction_id, account_id, zampay_reference
         FROM zampay_settlements WHERE status = 'NEW' ORDER BY created_at LIMIT 50`,
    );
    let resolved = 0;
    let failed = 0;
    for (const row of pending.rows) {
      try {
        await this.resolveOne(row);
        resolved += 1;
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : 'resolve failed';
        // Transient (timeout/rate-limited/not-found-yet) stays NEW to retry next
        // run; a hard error is recorded as FAILED for an operator to see.
        const hard = e instanceof ZampayError && !e.retryable && e.kind !== 'NOT_FOUND';
        if (hard) {
          await this.pool.query(
            `UPDATE zampay_settlements SET status='FAILED', failure_reason=$2 WHERE id=$1 AND status='NEW'`,
            [row.id, msg.slice(0, 500)],
          );
        }
      }
    }
    return { resolved, failed };
  }

  private async resolveOne(row: { id: string; transaction_id: string; account_id: string; zampay_reference: string }): Promise<void> {
    const resolutions = await this.invoices.resolve(row.zampay_reference);
    const allGroups: Array<{ group: ZampaySettlementGroup; invoiceNumber: string; transactionNumber: string | null }> = [];
    let anyPaid = false;
    for (const r of resolutions) {
      if (/paid/i.test(r.status) && !/notpaid/i.test(r.status)) anyPaid = true;
      for (const g of r.groups) allGroups.push({ group: g, invoiceNumber: r.invoiceNumber, transactionNumber: r.transactionNumber });
    }

    // A destination group is settleable regardless of the invoice's Paid/NotPaid
    // state: GSB marks the invoice Paid as soon as the customer pays us, and still
    // expects our settlement callback, so a Paid invoice is settled, not skipped.
    // Every group becomes a RESOLVED instruction whose callback fires
    // automatically on the next pass — no operator step, no wait for a bank wire.
    // INVOICE_PAID is now only the edge case of a Paid invoice with nothing to
    // settle; a NotPaid invoice with no services is a hard failure. The payment
    // reference we send GSB is our own InstacomPay transaction id.
    const firstInvoice = resolutions[0]?.invoiceNumber ?? null;
    if (allGroups.length === 0) {
      await this.pool.query(
        `UPDATE zampay_settlements SET status=$2::zampay_settlement_status, invoice_number=$3, failure_reason=$4 WHERE id=$1 AND status='NEW'`,
        [row.id, anyPaid ? 'INVOICE_PAID' : 'FAILED', firstInvoice,
         anyPaid ? 'invoice Paid but had no settleable services' : 'invoice had no settleable services'],
      );
      return;
    }
    const paymentRef = row.transaction_id; // our payment reference to GSB

    await withTransaction(this.pool, async (client) => {
      // Double-payment guard: split groups into ones we can settle and ones whose
      // (invoice, destination) is already settled/resolved under ANOTHER
      // transaction — a repeat payment for the same GSB invoice. We never pay
      // those twice.
      const fresh: typeof allGroups = [];
      const dups: Array<{ invoiceNumber: string; conflictTxn: string }> = [];
      for (const g of allGroups) {
        const existing = await client.query<{ transaction_id: string }>(
          `SELECT transaction_id FROM zampay_settlements
            WHERE invoice_number = $1 AND destination->>'bankAccountNumber' = $2
              AND status IN ('RESOLVED', 'SETTLED') AND transaction_id <> $3
            LIMIT 1`,
          [g.invoiceNumber, g.group.destination.bankAccountNumber, row.transaction_id],
        );
        if (existing.rowCount) dups.push({ invoiceNumber: g.invoiceNumber, conflictTxn: existing.rows[0].transaction_id });
        else fresh.push(g);
      }

      // Nothing left to settle — the whole invoice was already paid elsewhere.
      if (fresh.length === 0) {
        const d = dups[0];
        await client.query(
          `UPDATE zampay_settlements
              SET status='DUPLICATE', invoice_number=$2, callback_status=NULL, failure_reason=$3
            WHERE id=$1 AND status='NEW'`,
          [row.id, firstInvoice, `invoice ${d?.invoiceNumber ?? firstInvoice} already settled under transaction ${d?.conflictTxn ?? 'another transaction'}`],
        );
        await this.audit.write(client, {
          actorId: null,
          actorScope: 'SYSTEM',
          action: 'ZAMPAY_SETTLEMENT_DUPLICATE',
          target: row.transaction_id,
          metadata: { invoice: firstInvoice, conflictTransaction: d?.conflictTxn ?? null, blockedGroups: dups.length },
        });
        return;
      }

      // First FRESH group updates the NEW row in place; the rest are separate rows.
      const first = fresh[0];
      await client.query(
        `UPDATE zampay_settlements
            SET status='RESOLVED', invoice_number=$2, transaction_number=$3,
                service_ids=$4, destination=$5::jsonb, amount_ngwee=$6, currency=$7,
                payment_reference=$8, callback_status='PENDING', failure_reason=NULL
          WHERE id=$1 AND status='NEW'`,
        [row.id, first.invoiceNumber, first.transactionNumber, first.group.serviceIds,
         JSON.stringify(first.group.destination), first.group.amountNgwee.toString(), first.group.currency, paymentRef],
      );
      for (const extra of fresh.slice(1)) {
        await client.query(
          `INSERT INTO zampay_settlements
             (transaction_id, account_id, zampay_reference, invoice_number, transaction_number,
              service_ids, destination, amount_ngwee, currency, status, payment_reference,
              callback_status, environment)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,'RESOLVED',$10,'PENDING',$11)
           ON CONFLICT (transaction_id, (destination->>'bankAccountNumber')) DO NOTHING`,
          [row.transaction_id, row.account_id, row.zampay_reference, extra.invoiceNumber, extra.transactionNumber,
           extra.group.serviceIds, JSON.stringify(extra.group.destination), extra.group.amountNgwee.toString(), extra.group.currency, paymentRef, zampayEnvConfig().env],
        );
      }
      await this.audit.write(client, {
        actorId: null,
        actorScope: 'SYSTEM',
        action: 'ZAMPAY_SETTLEMENT_RESOLVED',
        target: row.transaction_id,
        metadata: { invoices: resolutions.map((r) => r.invoiceNumber), groups: fresh.length, skippedDuplicates: dups.length },
      });
    });
  }

  /**
   * Re-arm a FAILED settlement so the next reconcile run retries it. If it never
   * resolved (no destination) it returns to NEW; if the callback exhausted its
   * retries it returns to RESOLVED with a pending callback.
   */
  async retryCallback(id: string, actorId: string): Promise<void> {
    const res = await this.pool.query<{ transaction_id: string }>(
      `UPDATE zampay_settlements
          SET status = CASE WHEN destination IS NOT NULL THEN 'RESOLVED' ELSE 'NEW' END,
              callback_status = CASE WHEN destination IS NOT NULL THEN 'PENDING' ELSE NULL END,
              callback_attempts = 0, failure_reason = NULL
        WHERE id = $1 AND status = 'FAILED'
      RETURNING transaction_id`,
      [id],
    );
    if (res.rowCount === 0) throw new Error('settlement not found or not in a FAILED state');
    await withTransaction(this.pool, async (client) => {
      await this.audit.write(client, {
        actorId,
        actorScope: 'SYSTEM',
        action: 'ZAMPAY_SETTLEMENT_RETRIED',
        target: res.rows[0].transaction_id,
        metadata: { settlementId: id },
      });
    });
  }

  /**
   * Record (or clear) the bank batch reference against a settlement — the
   * reference finance gets from the bank when the payout is batched, used to
   * reconcile against the bank statement. Free-text; pass null/empty to clear.
   */
  async setBankBatchReference(id: string, bankBatchReference: string | null, actorId: string): Promise<void> {
    const value = bankBatchReference?.trim() || null;
    const res = await this.pool.query<{ transaction_id: string }>(
      `UPDATE zampay_settlements SET bank_batch_reference = $2 WHERE id = $1 RETURNING transaction_id`,
      [id, value],
    );
    if (res.rowCount === 0) throw new NotFoundError(`settlement not found: ${id}`);
    await withTransaction(this.pool, async (client) => {
      await this.audit.write(client, {
        actorId,
        actorScope: 'SYSTEM',
        action: 'ZAMPAY_BANK_BATCH_REFERENCE_SET',
        target: res.rows[0].transaction_id,
        metadata: { settlementId: id, bankBatchReference: value },
      });
    });
  }

  /** Send the settlement callback for every RESOLVED row whose callback is pending. */
  async sendDueCallbacks(): Promise<{ sent: number; failed: number }> {
    const due = await this.pool.query<{
      id: string; transaction_id: string; payment_reference: string; amount_ngwee: string;
      currency: string; destination: Record<string, string>; service_ids: string[]; paid_date: string;
    }>(
      `SELECT id, transaction_id, payment_reference, amount_ngwee::text, currency, destination, service_ids,
              to_char(created_at, 'YYYY-MM-DD') AS paid_date
         FROM zampay_settlements
        WHERE status='RESOLVED' AND callback_status='PENDING' AND callback_attempts < $1
        ORDER BY created_at LIMIT 50`,
      [MAX_CALLBACK_ATTEMPTS],
    );
    let sent = 0;
    let failed = 0;
    for (const row of due.rows) {
      try {
        await this.settlement.sendCallback({
          paymentReferenceNumber: row.payment_reference,
          amountNgwee: BigInt(row.amount_ngwee),
          currency: row.currency,
          destination: row.destination as never,
          serviceIds: row.service_ids,
          createdAt: row.paid_date ?? new Date().toISOString().slice(0, 10),
        });
        await this.pool.query(
          `UPDATE zampay_settlements
              SET status='SETTLED', callback_status='DELIVERED', settled_at=now(),
                  callback_attempts=callback_attempts+1, last_callback_at=now()
            WHERE id=$1`,
          [row.id],
        );
        sent += 1;
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : 'callback failed';
        await this.pool.query(
          `UPDATE zampay_settlements
              SET callback_attempts=callback_attempts+1, last_callback_at=now(),
                  callback_status=CASE WHEN callback_attempts+1 >= $2 THEN 'GIVEN_UP' ELSE 'PENDING' END,
                  status=CASE WHEN callback_attempts+1 >= $2 THEN 'FAILED' ELSE status END,
                  failure_reason=CASE WHEN callback_attempts+1 >= $2 THEN $3 ELSE failure_reason END
            WHERE id=$1`,
          [row.id, MAX_CALLBACK_ATTEMPTS, msg.slice(0, 500)],
        );
      }
    }
    return { sent, failed };
  }
}

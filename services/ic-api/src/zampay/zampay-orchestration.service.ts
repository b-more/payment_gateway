// ZamPay settlement orchestration — DB-driven, matching how settlement already
// works (status machine on a table, reconcile-job driven), not a Redis queue.
//
//   NEW           enqueued from a successful collection (hook)
//   READY_TO_WIRE resolved: destination + amount known, awaiting the operator wire
//   WIRED         operator wired the funds + entered the reference
//   SETTLED       settlement callback acknowledged by ZamPay
//   FAILED        invoice read failed / callback exhausted retries
//   INVOICE_PAID  invoice already Paid (Flow A) — flag, do not wire
//
// The reconcile job (run-zampay-reconcile) calls discoverPending() (pull model:
// pick up successful ZamPay-account collections) then resolvePending() then
// sendDueCallbacks(). The collection hot path is untouched.

import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { withTransaction } from '../database/tx';
import { AuditService } from '../audit/audit.service';
import { ZampayInvoiceService, type ZampaySettlementGroup } from './zampay-invoice.service';
import { ZampaySettlementService } from './zampay-settlement.service';
import { ZampayError } from './zampay.errors';

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
      `INSERT INTO zampay_settlements (transaction_id, account_id, zampay_reference, amount_ngwee, status)
       SELECT t.id, t.account_id, COALESCE(t.collection_reference, ''), t.total_amount, 'NEW'
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         JOIN account_settings s ON s.account_id = t.account_id
        WHERE a.account_number = $1
          AND s.zampay_settlement_enabled = true
          AND t.type = 'COLLECTION' AND t.status = 'SUCCESS'
          AND COALESCE(t.collection_reference, '') <> ''
          AND NOT EXISTS (SELECT 1 FROM zampay_settlements z WHERE z.transaction_id = t.id)`,
      [accountNumber],
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

    // A Paid invoice (Flow A) is recorded with full detail but flagged not to
    // wire; no settleable services is a hard failure. Otherwise every group
    // becomes a READY_TO_WIRE instruction.
    const firstInvoice = resolutions[0]?.invoiceNumber ?? null;
    if (allGroups.length === 0) {
      await this.pool.query(
        `UPDATE zampay_settlements SET status=$2::zampay_settlement_status, invoice_number=$3, failure_reason=$4 WHERE id=$1 AND status='NEW'`,
        [row.id, anyPaid ? 'INVOICE_PAID' : 'FAILED', firstInvoice,
         anyPaid ? 'invoice already Paid (Flow A)' : 'invoice had no settleable services'],
      );
      return;
    }
    const status = anyPaid ? 'INVOICE_PAID' : 'READY_TO_WIRE';

    await withTransaction(this.pool, async (client) => {
      // First group updates the NEW row in place; the rest are separate rows.
      const first = allGroups[0];
      await client.query(
        `UPDATE zampay_settlements
            SET status=$8::zampay_settlement_status, invoice_number=$2, transaction_number=$3,
                service_ids=$4, destination=$5::jsonb, amount_ngwee=$6, currency=$7,
                failure_reason=CASE WHEN $8='INVOICE_PAID' THEN 'invoice already Paid (Flow A)' ELSE NULL END
          WHERE id=$1 AND status='NEW'`,
        [row.id, first.invoiceNumber, first.transactionNumber, first.group.serviceIds,
         JSON.stringify(first.group.destination), first.group.amountNgwee.toString(), first.group.currency, status],
      );
      for (const extra of allGroups.slice(1)) {
        await client.query(
          `INSERT INTO zampay_settlements
             (transaction_id, account_id, zampay_reference, invoice_number, transaction_number,
              service_ids, destination, amount_ngwee, currency, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::zampay_settlement_status)
           ON CONFLICT (transaction_id, (destination->>'bankAccountNumber')) DO NOTHING`,
          [row.transaction_id, row.account_id, row.zampay_reference, extra.invoiceNumber, extra.transactionNumber,
           extra.group.serviceIds, JSON.stringify(extra.group.destination), extra.group.amountNgwee.toString(), extra.group.currency, status],
        );
      }
      await this.audit.write(client, {
        actorId: null,
        actorScope: 'SYSTEM',
        action: 'ZAMPAY_SETTLEMENT_RESOLVED',
        target: row.transaction_id,
        metadata: { invoices: resolutions.map((r) => r.invoiceNumber), groups: allGroups.length, status },
      });
    });
  }

  /** Operator confirms the bank wire; moves the instruction to WIRED. */
  async confirmWired(id: string, bankReference: string, actorId: string): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      const res = await client.query<{ transaction_id: string }>(
        `UPDATE zampay_settlements
            SET status='WIRED', bank_reference=$2, wired_by=$3, wired_at=now(), callback_status='PENDING'
          WHERE id=$1 AND status='READY_TO_WIRE'
        RETURNING transaction_id`,
        [id, bankReference, actorId],
      );
      if (res.rowCount === 0) throw new Error('settlement not found or not READY_TO_WIRE');
      await this.audit.write(client, {
        actorId,
        actorScope: 'SYSTEM',
        action: 'ZAMPAY_SETTLEMENT_WIRED',
        target: res.rows[0].transaction_id,
        metadata: { settlementId: id, bankReference },
      });
    });
  }

  /** Send the settlement callback for every WIRED row whose callback is pending. */
  async sendDueCallbacks(): Promise<{ sent: number; failed: number }> {
    const due = await this.pool.query<{
      id: string; transaction_id: string; bank_reference: string; amount_ngwee: string;
      currency: string; destination: Record<string, string>; service_ids: string[]; wired_date: string;
    }>(
      `SELECT id, transaction_id, bank_reference, amount_ngwee::text, currency, destination, service_ids,
              to_char(wired_at, 'YYYY-MM-DD') AS wired_date
         FROM zampay_settlements
        WHERE status='WIRED' AND callback_status='PENDING' AND callback_attempts < $1
        ORDER BY wired_at LIMIT 50`,
      [MAX_CALLBACK_ATTEMPTS],
    );
    let sent = 0;
    let failed = 0;
    for (const row of due.rows) {
      try {
        await this.settlement.sendCallback({
          paymentReferenceNumber: row.bank_reference,
          amountNgwee: BigInt(row.amount_ngwee),
          currency: row.currency,
          destination: row.destination as never,
          serviceIds: row.service_ids,
          createdAt: row.wired_date ?? new Date().toISOString().slice(0, 10),
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

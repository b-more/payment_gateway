import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { NotFoundError } from '../money/errors';
import { buildReportPdf, formatZmw, type PdfColumn, type PdfSummaryItem } from './pdf';

export type ReportType = 'TRANSACTIONS' | 'SETTLEMENTS';

export interface CreateReportInput {
  merchantId: string | null; // null = system/admin report
  name: string;
  reportType: ReportType;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  actorId: string;
}

interface ReportRow {
  id: string;
  merchant_id: string | null;
  report_type: ReportType;
  name: string;
  period_start: string;
  period_end: string;
}
type DataRow = Record<string, string | null>;

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',') + '\n';
}
function sumBig(rows: DataRow[], key: string): string {
  let total = 0n;
  for (const r of rows) {
    try { total += BigInt(r[key] || '0'); } catch { /* skip */ }
  }
  return total.toString();
}
function shortId(id: string | null): string {
  if (!id) return '—';
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}
function nowStamp(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

// Reports (§6.1.5/§6.2.5). Generation is synchronous; CSV and branded PDF are
// regenerated from the stored type + range on download. Scope: a null merchantId
// covers all data (admin); a set merchantId restricts to that merchant (NN-6).
@Injectable()
export class ReportService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async createReport(input: CreateReportInput): Promise<{ id: string }> {
    const res = await this.pool.query<{ id: string }>(
      `INSERT INTO reports (merchant_id, report_type, name, period_start, period_end, created_by)
       VALUES ($1, $2, $3, $4::date, $5::date, $6) RETURNING id`,
      [input.merchantId, input.reportType, input.name, input.from, input.to, input.actorId],
    );
    return { id: res.rows[0].id };
  }

  async listReports(merchantId: string | null): Promise<unknown[]> {
    const res = await this.pool.query(
      `SELECT id, report_type, name,
              to_char(period_start, 'YYYY-MM-DD') AS period_start,
              to_char(period_end, 'YYYY-MM-DD') AS period_end,
              status, to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
         FROM reports
        WHERE (CASE WHEN $1::uuid IS NULL THEN merchant_id IS NULL ELSE merchant_id = $1 END)
        ORDER BY created_at DESC LIMIT 200`,
      [merchantId],
    );
    return res.rows;
  }

  /** Resolve + scope-check a report against the caller's merchant. */
  private async getReport(reportId: string, merchantId: string | null): Promise<ReportRow> {
    const found = await this.pool.query<ReportRow>(
      `SELECT id, merchant_id, report_type, name,
              to_char(period_start, 'YYYY-MM-DD') AS period_start,
              to_char(period_end, 'YYYY-MM-DD') AS period_end
         FROM reports WHERE id = $1`,
      [reportId],
    );
    if (found.rowCount === 0) throw new NotFoundError(`report not found: ${reportId}`);
    const report = found.rows[0];
    if ((merchantId === null && report.merchant_id !== null) || (merchantId !== null && report.merchant_id !== merchantId)) {
      throw new NotFoundError(`report not found: ${reportId}`);
    }
    return report;
  }

  // ── Data fetch (shared by CSV + PDF) ────────────────────────────────────────
  private async fetchTransactions(merchantId: string | null, from: string, to: string): Promise<DataRow[]> {
    const res = await this.pool.query<DataRow>(
      `SELECT t.id, t.account_id, t.type, t.processor, t.msisdn,
              t.amount::text AS amount, t.charge::text AS charge, t.net_amount::text AS net_amount,
              t.status, t.collection_reference, t.environment,
              to_char(t.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
         FROM transactions t
        WHERE t.created_at >= $2::date AND t.created_at < ($3::date + interval '1 day')
          AND ($1::uuid IS NULL OR t.account_id IN (SELECT id FROM accounts WHERE merchant_id = $1))
        ORDER BY t.created_at`,
      [merchantId, from, to],
    );
    return res.rows;
  }

  private async fetchSettlements(merchantId: string | null, from: string, to: string): Promise<DataRow[]> {
    const res = await this.pool.query<DataRow>(
      `SELECT s.id, s.account_id, s.amount::text AS amount, s.status,
              to_char(s.settled_at, 'YYYY-MM-DD HH24:MI:SS') AS settled_at,
              to_char(s.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
         FROM settlements s
        WHERE s.created_at >= $2::date AND s.created_at < ($3::date + interval '1 day')
          AND ($1::uuid IS NULL OR s.account_id IN (SELECT id FROM accounts WHERE merchant_id = $1))
        ORDER BY s.created_at`,
      [merchantId, from, to],
    );
    return res.rows;
  }

  // ── CSV ─────────────────────────────────────────────────────────────────────
  async exportCsv(reportId: string, merchantId: string | null): Promise<{ filename: string; csv: string }> {
    const report = await this.getReport(reportId, merchantId);
    let csv: string;
    if (report.report_type === 'TRANSACTIONS') {
      const rows = await this.fetchTransactions(report.merchant_id, report.period_start, report.period_end);
      csv = csvRow(['id', 'account_id', 'type', 'processor', 'msisdn', 'amount_ngwee', 'charge_ngwee', 'net_amount_ngwee', 'status', 'collection_reference', 'environment', 'created_at']);
      for (const r of rows) {
        csv += csvRow([r.id, r.account_id, r.type, r.processor, r.msisdn, r.amount, r.charge, r.net_amount, r.status, r.collection_reference, r.environment, r.created_at]);
      }
    } else {
      const rows = await this.fetchSettlements(report.merchant_id, report.period_start, report.period_end);
      csv = csvRow(['id', 'account_id', 'amount_ngwee', 'status', 'settled_at', 'created_at']);
      for (const r of rows) {
        csv += csvRow([r.id, r.account_id, r.amount, r.status, r.settled_at, r.created_at]);
      }
    }
    const filename = `${report.report_type.toLowerCase()}-${report.period_start}_${report.period_end}.csv`;
    return { filename, csv };
  }

  // ── Branded PDF ──────────────────────────────────────────────────────────────
  async exportPdf(reportId: string, merchantId: string | null): Promise<{ filename: string; pdf: Buffer }> {
    const report = await this.getReport(reportId, merchantId);
    const scope = report.merchant_id === null ? 'All merchants (system-wide)' : 'Single merchant account';
    const meta = {
      title: report.report_type === 'TRANSACTIONS' ? 'Transactions Report' : 'Settlements Report',
      periodFrom: report.period_start,
      periodTo: report.period_end,
      generatedAt: nowStamp(),
      scope,
    };

    let columns: PdfColumn[];
    let rows: DataRow[];
    let summary: PdfSummaryItem[];

    if (report.report_type === 'TRANSACTIONS') {
      const txns = await this.fetchTransactions(report.merchant_id, report.period_start, report.period_end);
      rows = txns.map((r) => ({ ...r, env: r.environment === 'PRODUCTION' ? 'Live' : 'Sandbox' }));
      columns = [
        { key: 'created_at', label: 'Date / time', weight: 15 },
        { key: 'type', label: 'Type', weight: 11 },
        { key: 'processor', label: 'Rail', weight: 9 },
        { key: 'msisdn', label: 'MSISDN', weight: 12 },
        { key: 'amount', label: 'Amount (ZMW)', weight: 12, align: 'right', money: true },
        { key: 'charge', label: 'Charge (ZMW)', weight: 11, align: 'right', money: true },
        { key: 'net_amount', label: 'Net (ZMW)', weight: 12, align: 'right', money: true },
        { key: 'status', label: 'Status', weight: 10 },
        { key: 'env', label: 'Env', weight: 9 },
      ];
      summary = [
        { label: 'Transactions', value: String(rows.length) },
        { label: 'Volume', value: `ZMW ${formatZmw(sumBig(rows, 'amount'))}` },
        { label: 'Charges', value: `ZMW ${formatZmw(sumBig(rows, 'charge'))}` },
        { label: 'Net', value: `ZMW ${formatZmw(sumBig(rows, 'net_amount'))}` },
        { label: 'Successful', value: String(rows.filter((r) => r.status === 'SUCCESS').length) },
      ];
    } else {
      const raw = await this.fetchSettlements(report.merchant_id, report.period_start, report.period_end);
      rows = raw.map((r) => ({ ...r, account: shortId(r.account_id) }));
      columns = [
        { key: 'created_at', label: 'Created', weight: 20 },
        { key: 'settled_at', label: 'Settled', weight: 20 },
        { key: 'account', label: 'Account', weight: 18 },
        { key: 'amount', label: 'Amount (ZMW)', weight: 18, align: 'right', money: true },
        { key: 'status', label: 'Status', weight: 14 },
      ];
      summary = [
        { label: 'Settlements', value: String(rows.length) },
        { label: 'Total settled', value: `ZMW ${formatZmw(sumBig(rows, 'amount'))}` },
        { label: 'Completed', value: String(rows.filter((r) => r.status === 'SETTLED').length) },
      ];
    }

    const pdf = await buildReportPdf(meta, columns, rows, summary);
    const filename = `${report.report_type.toLowerCase()}-${report.period_start}_${report.period_end}.pdf`;
    return { filename, pdf };
  }
}

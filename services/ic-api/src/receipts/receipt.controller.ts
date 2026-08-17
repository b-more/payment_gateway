import { Controller, Get, Header, Inject, Param, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { RateLimitGuard } from '../api/rate-limit.guard';

interface Row {
  id: string;
  processor: string;
  msisdn: string | null;
  amount: string;
  charge: string;
  total_amount: string;
  status: string;
  created_at: Date;
  collection_reference: string | null;
  merchant: string;
  account_number: string;
  branch: string | null;
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const kwacha = (ngwee: string): string => `K${(Number(BigInt(ngwee)) / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Public, unauthenticated receipt lookup by transaction id (an unguessable uuid).
// This is what the receipt QR links to. HTML only; rate-limited.
@ApiExcludeController()
@Controller('receipts')
@UseGuards(RateLimitGuard)
export class ReceiptController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get(':id')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async view(@Param('id') id: string): Promise<string> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return this.notFound();
    const r = await this.pool.query<Row>(
      `SELECT t.id, t.processor, t.msisdn, t.amount::text, t.charge::text, t.total_amount::text,
              t.status, t.created_at, t.collection_reference,
              m.name AS merchant, a.account_number, d.label AS branch
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         JOIN merchants m ON m.id = a.merchant_id
         LEFT JOIN devices d ON d.id = t.device_id
        WHERE t.id = $1`,
      [id],
    );
    if (r.rowCount === 0) return this.notFound();
    return this.render(r.rows[0]);
  }

  private render(t: Row): string {
    const paid = t.status === 'SUCCESS';
    const when = t.created_at.toISOString().slice(0, 16).replace('T', ' ');
    const rowHtml = (label: string, value: string, strong = false): string =>
      `<div style="display:flex;justify-content:space-between;padding:6px 0;${strong ? 'font-weight:700;font-size:17px;color:#0b1524' : 'color:#334155'}">
         <span style="color:#64748b">${esc(label)}</span><span>${esc(value)}</span></div>`;
    return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipt · ${esc(t.merchant)}</title></head>
<body style="margin:0;background:#eef1f6;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:420px;margin:0 auto;padding:20px">
    <div style="background:#fff;border-radius:16px;padding:24px;box-shadow:0 10px 30px rgba(11,21,36,.10)">
      <div style="text-align:center">
        <div style="font-size:22px;font-weight:800;color:#0b1524">${esc(t.merchant)}</div>
        ${t.branch ? `<div style="color:#64748b;font-size:13px">${esc(t.branch)}</div>` : ''}
        <div style="color:#94a3b8;font-size:12px;letter-spacing:1px;margin-top:6px">SALE RECEIPT</div>
      </div>
      <div style="text-align:center;margin:18px 0">
        <div style="display:inline-block;background:${paid ? '#e7f5ee' : '#fdecec'};color:${paid ? '#12855a' : '#e11b22'};font-weight:700;font-size:13px;padding:5px 12px;border-radius:999px">${esc(t.status)}</div>
        <div style="font-size:38px;font-weight:800;color:#0b1524;margin-top:10px">${kwacha(t.total_amount)}</div>
      </div>
      <div style="border-top:1px dashed #c9d2e0;margin:8px 0"></div>
      ${rowHtml('Amount', kwacha(t.amount))}
      ${t.charge !== '0' ? rowHtml('Charge', kwacha(t.charge)) : ''}
      ${rowHtml('Total', kwacha(t.total_amount), true)}
      <div style="border-top:1px dashed #c9d2e0;margin:8px 0"></div>
      ${rowHtml('Phone', t.msisdn ?? '—')}
      ${rowHtml('Network', t.processor)}
      ${rowHtml('Reference', (t.collection_reference ?? t.id).slice(0, 12))}
      ${rowHtml('Date', when)}
      <div style="text-align:center;color:#94a3b8;font-size:12px;margin-top:18px">Powered by InstacomPay</div>
    </div>
  </div>
</body></html>`;
  }

  private notFound(): string {
    return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt not found</title></head>
<body style="margin:0;background:#eef1f6;font-family:system-ui,sans-serif">
  <div style="max-width:420px;margin:60px auto;text-align:center;color:#64748b">
    <div style="font-size:20px;font-weight:700;color:#0b1524">Receipt not found</div>
    <p>This receipt link is invalid or has expired.</p>
  </div></body></html>`;
  }
}

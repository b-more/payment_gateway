import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { MessagingService, type OwnerAlert } from './messaging.service';

interface Row {
  id: string;
  name: string;
  phone: string | null;
  processor: string;
  cnt: number;
  gross: string; // ngwee
}

interface MerchantSummary {
  name: string;
  phone: string;
  count: number;
  grossNgwee: bigint;
  byNetwork: Map<string, bigint>;
}

export interface DailySummaryResult {
  window: string;
  merchants: number;
  sentSms: number;
  sentWhatsapp: number;
  skippedNoPhone: number;
  failed: number;
}

/**
 * End-of-day takings summary, one message per merchant to their registered phone.
 * Delivered via MessagingService (SMS today, WhatsApp when configured).
 */
@Injectable()
export class DailySummaryService {
  private readonly logger = new Logger('DailySummary');

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly messaging: MessagingService,
  ) {}

  /**
   * @param offsetDays 0 = today (default), 1 = yesterday, …
   * @param testPhone  if set, every summary goes to THIS number instead of the
   *                   merchant's — for safe end-to-end testing.
   */
  async run(offsetDays = Number(process.env.DAILY_SUMMARY_DAY_OFFSET ?? '0'), testPhone?: string | null): Promise<DailySummaryResult> {
    const res = await this.pool.query<Row>(
      `SELECT m.id, COALESCE(NULLIF(m.trading_name, ''), m.name) AS name, m.phone, t.processor,
              COUNT(*)::int AS cnt, COALESCE(SUM(t.amount), 0)::text AS gross
         FROM merchants m
         JOIN accounts a ON a.merchant_id = m.id
         JOIN transactions t ON t.account_id = a.id
        WHERE t.type = 'COLLECTION' AND t.status = 'SUCCESS'
          AND t.created_at >= date_trunc('day', now() - ($1 || ' days')::interval)
          AND t.created_at <  date_trunc('day', now() - ($1 || ' days')::interval) + interval '1 day'
        GROUP BY m.id, name, m.phone, t.processor`,
      [offsetDays],
    );

    // Fold the per-(merchant, processor) rows into one summary per merchant.
    const merchants = new Map<string, MerchantSummary>();
    for (const r of res.rows) {
      const s = merchants.get(r.id) ?? { name: r.name, phone: (r.phone ?? '').trim(), count: 0, grossNgwee: 0n, byNetwork: new Map() };
      const g = BigInt(r.gross || '0');
      s.count += r.cnt;
      s.grossNgwee += g;
      s.byNetwork.set(r.processor, (s.byNetwork.get(r.processor) ?? 0n) + g);
      merchants.set(r.id, s);
    }

    const dateLabel = dayLabel(offsetDays);
    const result: DailySummaryResult = {
      window: dateLabel, merchants: merchants.size, sentSms: 0, sentWhatsapp: 0, skippedNoPhone: 0, failed: 0,
    };

    for (const s of merchants.values()) {
      const phone = (testPhone ?? s.phone).trim();
      if (!/^(\+?260|0)\d{8,10}$/.test(phone)) { result.skippedNoPhone += 1; continue; }
      try {
        const via = await this.messaging.sendOwnerAlert(buildAlert(s, phone, dateLabel));
        if (via === 'whatsapp') result.sentWhatsapp += 1; else result.sentSms += 1;
      } catch (e) {
        result.failed += 1;
        this.logger.warn(`summary to ${s.name} failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    return result;
  }
}

function buildAlert(s: MerchantSummary, phone: string, dateLabel: string): OwnerAlert {
  const gross = formatKwacha(s.grossNgwee);
  const nets = [...s.byNetwork.entries()]
    .sort((a, b) => (b[1] > a[1] ? 1 : -1))
    .map(([net, amt]) => `${label(net)} ${formatKwacha(amt)}`);
  const topNetwork = nets[0] ?? '—';

  const smsText =
    `InstacomPay: ${s.name} — ${dateLabel}. ${s.count} collection${s.count === 1 ? '' : 's'}, ` +
    `ZMW ${gross}.` + (nets.length ? ` ${nets.join(' · ')}` : '');

  // Template body params {{1}}..{{5}} — see the drafted UTILITY template.
  const waParams = [s.name, dateLabel, String(s.count), gross, topNetwork];
  return { phone, smsText, waParams };
}

function label(processor: string): string {
  switch (processor.toUpperCase()) {
    case 'MTN': return 'MTN';
    case 'AIRTEL': return 'Airtel';
    case 'ZAMTEL': return 'Zamtel';
    default: return processor;
  }
}

function formatKwacha(ngwee: bigint): string {
  const whole = ngwee / 100n;
  const frac = (ngwee % 100n).toString().padStart(2, '0');
  // Thousands separators on the whole part.
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped}.${frac}`;
}

function dayLabel(offsetDays: number): string {
  const d = new Date(Date.now() - offsetDays * 86_400_000);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { SmsService } from './sms.service';
import type { TransactionNotifier, TransactionRecord } from '../transactions/transaction.service';

/**
 * Texts the customer the outcome of a collection — success OR failure — exactly
 * once, when the transaction resolves. Inert if SMS isn't configured. Best-effort:
 * TransactionService calls this fire-and-forget.
 */
@Injectable()
export class TransactionSmsNotifier implements TransactionNotifier {
  private readonly publicBase = (process.env.PUBLIC_BASE_URL ?? 'https://api.instacompayzm.com').trim();

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly sms: SmsService,
  ) {}

  async onResolved(record: TransactionRecord): Promise<void> {
    if (!this.sms.isConfigured) return;
    if (record.type !== 'COLLECTION') return; // customers only get texted for their own payments
    const msisdn = (record.msisdn ?? '').trim();
    if (!/^(\+?260|0)\d{8,10}$/.test(msisdn)) return;

    const merchant = await this.merchantName(record.accountId);
    const amount = formatKwacha(record.amount);
    const message =
      record.status === 'SUCCESS'
        ? `${merchant}: Payment received ZMW ${amount}. Receipt: ${this.publicBase}/v1/receipts/${record.id}`
        : `${merchant}: Your payment of ZMW ${amount} was not completed. Please try again.`;

    await this.sms.send(msisdn, message);
  }

  private async merchantName(accountId: string): Promise<string> {
    const r = await this.pool.query<{ name: string }>(
      `SELECT COALESCE(NULLIF(m.trading_name, ''), m.name) AS name
         FROM accounts a JOIN merchants m ON m.id = a.merchant_id WHERE a.id = $1`,
      [accountId],
    );
    return r.rows[0]?.name ?? 'InstacomPay';
  }
}

function formatKwacha(ngwee: bigint): string {
  const whole = ngwee / 100n;
  const frac = (ngwee % 100n).toString().padStart(2, '0');
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped}.${frac}`;
}

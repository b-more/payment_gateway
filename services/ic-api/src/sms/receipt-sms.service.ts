import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { NotFoundError, ValidationError } from '../money/errors';
import { SmsService } from './sms.service';

interface TxnRow {
  id: string;
  amount: string; // ngwee
  msisdn: string | null;
  status: string;
  merchant: string;
}

/** Sends a customer a link to their receipt by SMS. */
@Injectable()
export class ReceiptSmsService {
  private readonly publicBase = (process.env.PUBLIC_BASE_URL ?? 'https://api.instacompayzm.com').trim();

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly sms: SmsService,
  ) {}

  async sendForTransaction(accountId: string, txnId: string, phoneOverride?: string | null): Promise<void> {
    const res = await this.pool.query<TxnRow>(
      `SELECT t.id, t.amount::text AS amount, t.msisdn, t.status,
              COALESCE(NULLIF(m.trading_name, ''), m.name) AS merchant
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         JOIN merchants m ON m.id = a.merchant_id
        WHERE t.id = $1 AND t.account_id = $2`,
      [txnId, accountId],
    );
    if (res.rowCount === 0) throw new NotFoundError(`transaction not found: ${txnId}`);
    const row = res.rows[0];
    if (row.status !== 'SUCCESS') {
      throw new ValidationError('a receipt SMS is only available for a successful payment');
    }

    const phone = (phoneOverride ?? row.msisdn ?? '').trim();
    if (!/^(\+?260|0)\d{8,10}$/.test(phone)) {
      throw new ValidationError('a valid Zambian phone number is required');
    }

    const link = `${this.publicBase}/v1/receipts/${row.id}`;
    const message = `${row.merchant}: Payment received ZMW ${formatKwacha(row.amount)}. Receipt: ${link}`;
    await this.sms.send(phone, message);
  }
}

/** Integer ngwee string → "K" decimal, exact (no float math). */
function formatKwacha(ngwee: string): string {
  let n: bigint;
  try { n = BigInt(ngwee); } catch { return '0.00'; }
  const whole = n / 100n;
  const frac = (n % 100n).toString().padStart(2, '0');
  return `${whole.toString()}.${frac}`;
}

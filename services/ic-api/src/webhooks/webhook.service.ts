import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { Redis } from 'ioredis';
import { PG_POOL } from '../database/database.module';
import { REDIS } from '../redis/redis.module';
import { signWebhook } from './webhook.signing';
import type { TransactionStatus } from '../money/types';

export const WEBHOOK_CONFIG = Symbol('WEBHOOK_CONFIG');

export interface WebhookConfig {
  backoffSeconds: readonly number[];
  timeoutMs: number;
}

const READY_KEY = 'wh:ready'; // list of jobs ready to attempt now
const RETRY_KEY = 'wh:retry'; // zset of scheduled retries, scored by due-time (ms)

interface WebhookJob {
  transactionId: string;
  status: TransactionStatus;
  eventId: string;
  attempt: number; // attempts already made
}

interface TxnDataRow {
  id: string;
  account_id: string;
  type: string;
  processor: string;
  msisdn: string | null;
  amount: string;
  charge: string;
  net_amount: string;
  status: string;
  failure_reason: string | null;
  collection_reference: string | null;
  environment: string;
}
interface SettingsRow {
  callback_url: string | null;
  webhook_signing_secret: string | null;
}

/**
 * Webhook delivery (§5.7). On a transaction reaching a final state the engine
 * calls enqueue() (WH-1), which pushes a job to a Redis queue (WH-3, async — it
 * never blocks the transaction). A worker drains the queue, POSTs a signed
 * payload (WH-2), records every attempt in webhook_deliveries (WH-5), and on a
 * non-2xx schedules a retry with backoff, then GIVEN_UP (WH-4).
 */
@Injectable()
export class WebhookService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(WEBHOOK_CONFIG) private readonly config: WebhookConfig,
  ) {}

  /** Hand a final-state transaction off to the queue. Best-effort: a queue
   *  failure must never break the transaction that triggered it (WH-3). */
  async enqueue(transactionId: string, status: TransactionStatus): Promise<void> {
    const job: WebhookJob = { transactionId, status, eventId: randomUUID(), attempt: 0 };
    try {
      await this.redis.lpush(READY_KEY, JSON.stringify(job));
    } catch {
      // swallow — the row can also be re-driven from webhook_deliveries if needed
    }
  }

  /** Move due scheduled retries into the ready queue. */
  async pumpDueRetries(now = Date.now()): Promise<number> {
    const due = await this.redis.zrangebyscore(RETRY_KEY, '-inf', now, 'LIMIT', 0, 200);
    let moved = 0;
    for (const member of due) {
      if ((await this.redis.zrem(RETRY_KEY, member)) > 0) {
        await this.redis.lpush(READY_KEY, member);
        moved += 1;
      }
    }
    return moved;
  }

  /** Attempt up to `max` ready jobs. Returns how many were processed. */
  async processReady(max = 50): Promise<number> {
    let processed = 0;
    for (let i = 0; i < max; i += 1) {
      const raw = await this.redis.rpop(READY_KEY);
      if (raw === null) break;
      await this.deliver(JSON.parse(raw) as WebhookJob);
      processed += 1;
    }
    return processed;
  }

  /** Make one delivery attempt for a job, recording the outcome and scheduling
   *  a retry / giving up as needed. */
  async deliver(job: WebhookJob): Promise<void> {
    const txnResult = await this.pool.query<TxnDataRow>(
      `SELECT id, account_id, type, processor, msisdn, amount, charge, net_amount,
              status, failure_reason, collection_reference, environment
         FROM transactions WHERE id = $1`,
      [job.transactionId],
    );
    if (txnResult.rowCount === 0) return;
    const txn = txnResult.rows[0];

    const settingsResult = await this.pool.query<SettingsRow>(
      'SELECT callback_url, webhook_signing_secret FROM account_settings WHERE account_id = $1',
      [txn.account_id],
    );
    const settings = settingsResult.rowCount === 0 ? null : settingsResult.rows[0];
    if (!settings || !settings.callback_url) return; // no webhook configured (WH-1)

    const url = settings.callback_url;
    const attemptNumber = job.attempt + 1;

    if (!settings.webhook_signing_secret) {
      // Misconfiguration: cannot sign (WH-2). Flag for manual, do not retry.
      await this.record(txn.id, url, attemptNumber, null, 'GIVEN_UP', null);
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const eventType = `transaction.${job.status.toLowerCase()}`;
    const body = JSON.stringify({
      id: job.eventId,
      type: eventType,
      created_at: new Date().toISOString(),
      data: this.toData(txn),
    });
    const signature = signWebhook(settings.webhook_signing_secret, timestamp, body);
    const { code, ok } = await this.post(url, body, timestamp, signature, eventType);

    if (ok) {
      await this.record(txn.id, url, attemptNumber, code, 'DELIVERED', null);
      return;
    }
    if (job.attempt < this.config.backoffSeconds.length) {
      const due = Date.now() + this.config.backoffSeconds[job.attempt] * 1000;
      await this.record(txn.id, url, attemptNumber, code, 'FAILED', new Date(due).toISOString());
      await this.redis.zadd(RETRY_KEY, due, JSON.stringify({ ...job, attempt: job.attempt + 1 }));
    } else {
      await this.record(txn.id, url, attemptNumber, code, 'GIVEN_UP', null); // WH-4
    }
  }

  private toData(txn: TxnDataRow): Record<string, string | null> {
    return {
      id: txn.id,
      account_id: txn.account_id,
      type: txn.type,
      processor: txn.processor,
      msisdn: txn.msisdn,
      amount: txn.amount, // money already serialised as ngwee strings (NN-1)
      charge: txn.charge,
      net_amount: txn.net_amount,
      status: txn.status,
      failure_reason: txn.failure_reason,
      collection_reference: txn.collection_reference,
      environment: txn.environment,
    };
  }

  private async post(
    url: string,
    body: string,
    timestamp: string,
    signature: string,
    eventType: string,
  ): Promise<{ code: number | null; ok: boolean }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Instacompay-Event': eventType,
          'X-Instacompay-Signature': `t=${timestamp},v1=${signature}`,
        },
        body,
      });
      return { code: res.status, ok: res.ok };
    } catch {
      return { code: null, ok: false };
    } finally {
      clearTimeout(timer);
    }
  }

  private async record(
    transactionId: string,
    url: string,
    attempt: number,
    responseCode: number | null,
    status: 'DELIVERED' | 'FAILED' | 'GIVEN_UP',
    nextRetryAt: string | null,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO webhook_deliveries
         (transaction_id, url, attempt, response_code, status, next_retry_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [transactionId, url, attempt, responseCode, status, nextRetryAt],
    );
  }
}

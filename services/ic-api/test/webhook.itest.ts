import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { Redis } from 'ioredis';
import { createPool } from '../src/database/database.module';
import { WebhookService, type WebhookConfig } from '../src/webhooks/webhook.service';
import { verifyWebhook } from '../src/webhooks/webhook.signing';

// Requires DATABASE_URL (migrated) and REDIS_URL.
const pool = createPool(process.env.DATABASE_URL);
const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');

interface Captured {
  headers: Record<string, string | string[] | undefined>;
  body: string;
}
const received: Captured[] = [];
let nextStatus = 200;
let server: Server;
let hookUrl = '';

// Short backoff so the retry path reaches GIVEN_UP without real waits.
const config: WebhookConfig = { backoffSeconds: [0, 0], timeoutMs: 5000 };
const webhooks = new WebhookService(pool, redis, config);

before(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      res.statusCode = nextStatus;
      res.end('ok');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  hookUrl = `http://127.0.0.1:${port}/hook`;
  await redis.del('wh:ready', 'wh:retry');
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await redis.quit();
  await pool.end();
});

async function seedFinalTransaction(secret: string | null): Promise<string> {
  const m = await pool.query<{ id: string }>(
    "INSERT INTO merchants (name, merchant_type, email) VALUES ('W','PRIVATE','w@w.zm') RETURNING id",
  );
  const a = await pool.query<{ id: string }>(
    "INSERT INTO accounts (merchant_id, account_type) VALUES ($1,'COLLECTION') RETURNING id",
    [m.rows[0].id],
  );
  const accountId = a.rows[0].id;
  await pool.query(
    'INSERT INTO account_settings (account_id, callback_url, webhook_signing_secret) VALUES ($1,$2,$3)',
    [accountId, hookUrl, secret],
  );
  const t = await pool.query<{ id: string }>(
    `INSERT INTO transactions (account_id, type, processor, amount, net_amount, total_amount, status, idempotency_key, environment)
     VALUES ($1,'COLLECTION','MTN',100000,100000,100000,'SUCCESS',$2,'SANDBOX') RETURNING id`,
    [accountId, randomUUID()],
  );
  return t.rows[0].id;
}

test('WH-1/2/5: delivers a signed payload and records DELIVERED', async () => {
  received.length = 0;
  nextStatus = 200;
  const secret = 'whsec_ok';
  const txnId = await seedFinalTransaction(secret);

  await webhooks.enqueue(txnId, 'SUCCESS');
  const processed = await webhooks.processReady(10);
  assert.equal(processed, 1);
  assert.equal(received.length, 1);

  // Verify the HMAC signature the merchant would check.
  const sigHeader = String(received[0].headers['x-instacompay-signature']);
  const m = /^t=(\d+),v1=([0-9a-f]+)$/.exec(sigHeader);
  assert.ok(m, 'signature header present');
  assert.ok(verifyWebhook(secret, m[1], received[0].body, m[2]));

  const payload = JSON.parse(received[0].body) as { type: string; data: { id: string } };
  assert.equal(payload.type, 'transaction.success');
  assert.equal(payload.data.id, txnId);

  const del = await pool.query<{ status: string; attempt: number }>(
    'SELECT status, attempt FROM webhook_deliveries WHERE transaction_id = $1',
    [txnId],
  );
  assert.equal(del.rows[0].status, 'DELIVERED');
  assert.equal(del.rows[0].attempt, 1);
});

test('WH-4/5: non-2xx retries with backoff then GIVEN_UP, every attempt recorded', async () => {
  received.length = 0;
  nextStatus = 500; // always fail
  const txnId = await seedFinalTransaction('whsec_fail');

  await webhooks.enqueue(txnId, 'SUCCESS');
  for (let i = 0; i < 6; i += 1) {
    await webhooks.pumpDueRetries();
    if ((await webhooks.processReady(10)) === 0) break;
  }

  // backoff length 2 -> attempt1 (FAILED), attempt2 (FAILED), attempt3 (GIVEN_UP)
  const rows = await pool.query<{ status: string; attempt: number }>(
    'SELECT status, attempt FROM webhook_deliveries WHERE transaction_id = $1 ORDER BY attempt',
    [txnId],
  );
  assert.equal(rows.rowCount, 3); // WH-5: every attempt recorded
  assert.deepEqual(
    rows.rows.map((r) => r.status),
    ['FAILED', 'FAILED', 'GIVEN_UP'],
  );
  assert.equal(received.length, 3);
});

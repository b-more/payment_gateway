import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WEBHOOK_BACKOFF_SECONDS,
  signWebhook,
  verifyWebhook,
} from '../src/webhooks/webhook.signing';

test('WH-4: backoff schedule is 1m, 5m, 30m, 2h, 6h', () => {
  assert.deepEqual([...DEFAULT_WEBHOOK_BACKOFF_SECONDS], [60, 300, 1800, 7200, 21600]);
});

test('WH-2: signature is deterministic and verifiable', () => {
  const secret = 'whsec_test';
  const ts = '1700000000';
  const body = '{"id":"evt_1","type":"transaction.success"}';
  const sig = signWebhook(secret, ts, body);
  assert.equal(sig, signWebhook(secret, ts, body)); // deterministic
  assert.ok(verifyWebhook(secret, ts, body, sig)); // verifies
  assert.equal(verifyWebhook('wrong', ts, body, sig), false); // wrong secret fails
  assert.equal(verifyWebhook(secret, ts, body + 'x', sig), false); // tampered body fails
});

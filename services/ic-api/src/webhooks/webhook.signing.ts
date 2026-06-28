import { createHmac, timingSafeEqual } from 'node:crypto';

// Retry backoff schedule (WH-4): 1m, 5m, 30m, 2h, 6h, then GIVEN_UP.
export const DEFAULT_WEBHOOK_BACKOFF_SECONDS: readonly number[] = [60, 300, 1800, 7200, 21600];

/**
 * Sign a webhook body (WH-2). Merchants verify with the same scheme using their
 * account's webhook_signing_secret over `"<timestamp>.<rawBody>"`.
 */
export function signWebhook(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

/** Constant-time verification helper (what a merchant integration would run). */
export function verifyWebhook(
  secret: string,
  timestamp: string,
  rawBody: string,
  signatureHex: string,
): boolean {
  const expected = Buffer.from(signWebhook(secret, timestamp, rawBody), 'hex');
  const provided = Buffer.from(signatureHex, 'hex');
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

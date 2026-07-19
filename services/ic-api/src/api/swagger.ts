import { applyDecorators } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

/**
 * Auth headers for every /v1 call. Two modes:
 *   SIMPLE: X-Api-Key plus X-Api-Secret (SEC-API2b)
 *   SIGNED: X-Api-Key plus X-Timestamp and X-Signature (SEC-API2/3)
 */
export function ApiAuthHeaders(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiHeader({ name: 'X-Api-Key', required: true, description: 'Your public api_key, for example ic_live_...' }),
    ApiHeader({
      name: 'X-Api-Secret',
      required: false,
      description: 'Simple auth. Your api secret, or send Authorization: Bearer <secret> instead.',
    }),
    ApiHeader({
      name: 'X-Timestamp',
      required: false,
      description: 'Signed auth only. Unix epoch seconds, within a 5 minute window.',
    }),
    ApiHeader({
      name: 'X-Signature',
      required: false,
      description:
        'Signed auth only. HMAC-SHA256(signingKey, `${ts}.${METHOD}.${path}.${rawBody}`) as hex. Sending this header selects signed mode.',
    }),
  );
}

/** Idempotency header required on mutating endpoints (IDEM-1). */
export function ApiIdempotencyHeader(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiHeader({
      name: 'Idempotency-Key',
      required: true,
      description: 'Unique key per mutating request; replays return the original result',
    }),
  );
}

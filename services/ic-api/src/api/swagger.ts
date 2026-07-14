import { applyDecorators } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

/**
 * Auth headers for every /v1 call. Two modes:
 *   SIMPLE — X-Api-Key + X-Api-Secret (SEC-API2b)
 *   SIGNED — X-Api-Key + X-Timestamp + X-Signature (SEC-API2/3)
 */
export function ApiAuthHeaders(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiHeader({ name: 'X-Api-Key', required: true, description: 'Public api_key, e.g. ic_live_…' }),
    ApiHeader({
      name: 'X-Api-Secret',
      required: false,
      description: 'SIMPLE auth: your api secret (or send `Authorization: Bearer <secret>`).',
    }),
    ApiHeader({
      name: 'X-Timestamp',
      required: false,
      description: 'SIGNED auth only: Unix epoch seconds (±5m window)',
    }),
    ApiHeader({
      name: 'X-Signature',
      required: false,
      description:
        'SIGNED auth only: HMAC-SHA256(signingKey, `${ts}.${METHOD}.${path}.${rawBody}`) as hex. Sending this selects signed mode.',
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

import { applyDecorators } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

/** Signed-request headers required on every /v1 call (SEC-API2/3). */
export function ApiAuthHeaders(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiHeader({ name: 'X-Api-Key', required: true, description: 'Public api_key, e.g. ic_live_…' }),
    ApiHeader({ name: 'X-Timestamp', required: true, description: 'Unix epoch seconds (±5m window)' }),
    ApiHeader({
      name: 'X-Signature',
      required: true,
      description: 'HMAC-SHA256(signingKey, `${ts}.${METHOD}.${path}.${rawBody}`) as hex',
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

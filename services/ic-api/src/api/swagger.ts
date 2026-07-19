import { applyDecorators } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

/**
 * Auth headers for every /v1 call: X-Api-Key plus X-Api-Secret (SEC-API2b).
 *
 * Signed mode (X-Timestamp + X-Signature, SEC-API2/3) is still fully supported
 * by ApiAuthGuard and every credential is still issued a signing key. It is
 * deliberately not advertised here: offering two ways to authenticate raised
 * more integrator questions than the extra hardening was worth. Document it
 * directly for any merchant who asks for it.
 */
export function ApiAuthHeaders(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiHeader({ name: 'X-Api-Key', required: true, description: 'Your public api_key, for example ic_live_...' }),
    ApiHeader({
      name: 'X-Api-Secret',
      required: false,
      description: 'Simple auth. Your api secret, or send Authorization: Bearer <secret> instead.',
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

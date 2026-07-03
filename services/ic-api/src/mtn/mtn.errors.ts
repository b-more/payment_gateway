// Typed MTN MoMo error taxonomy. MTN returns RFC-style bodies { code, message }
// (or { error }). Preserve code/message for support; classify so callers know
// whether to alert, treat as duplicate, enter the UNKNOWN/poll flow, or refresh.

export type MtnErrorKind =
  | 'AUTH' // 401 — refresh token once, retry once
  | 'FORBIDDEN' // 403 — subscription/IP/product issue, alert, do not retry
  | 'NOT_FOUND' // 404 — reference not found yet (status may not exist immediately)
  | 'CONFLICT' // 409 — duplicate X-Reference-Id (already submitted)
  | 'BAD_REQUEST' // 400 — validation error, do not retry
  | 'TIMEOUT' // 5xx / network timeout — UNKNOWN flow (may have succeeded)
  | 'RATE_LIMITED' // 429
  | 'REMOTE'
  | 'UNKNOWN';

export interface MtnErrorMeta {
  httpStatus?: number | undefined;
  code?: string | undefined; // MTN error code, e.g. PAYER_NOT_FOUND
  message?: string | undefined;
  referenceId?: string | undefined;
}

export class MtnError extends Error {
  constructor(
    readonly kind: MtnErrorKind,
    message: string,
    readonly meta: MtnErrorMeta = {},
  ) {
    super(message);
    this.name = 'MtnError';
  }

  get retryable(): boolean {
    return this.kind === 'TIMEOUT' || this.kind === 'RATE_LIMITED' || this.kind === 'NOT_FOUND';
  }

  /** A timeout/5xx where the request may have succeeded server-side. */
  get indeterminate(): boolean {
    return this.kind === 'TIMEOUT';
  }
}

interface MtnBodyShape {
  code?: string;
  message?: string;
  error?: string;
  error_description?: string;
}

export function classifyMtnError(httpStatus: number, body: unknown): MtnError {
  const b = (body ?? {}) as MtnBodyShape;
  const message = b.message ?? b.error_description ?? b.error ?? b.code ?? `mtn http ${httpStatus}`;
  const meta: MtnErrorMeta = { httpStatus, code: b.code, message };

  switch (httpStatus) {
    case 401:
      return new MtnError('AUTH', message, meta);
    case 403:
      return new MtnError('FORBIDDEN', message, meta);
    case 404:
      return new MtnError('NOT_FOUND', message, meta);
    case 409:
      return new MtnError('CONFLICT', message, meta);
    case 400:
      return new MtnError('BAD_REQUEST', message, meta);
    case 429:
      return new MtnError('RATE_LIMITED', message, meta);
    case 500:
    case 502:
    case 503:
    case 504:
      return new MtnError('TIMEOUT', message, meta);
    default:
      return new MtnError('REMOTE', message, meta);
  }
}

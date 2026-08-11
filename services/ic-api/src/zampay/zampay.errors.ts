// Typed ZamPay error taxonomy. ZamPay returns standard HTTP statuses with JSON
// bodies. Preserve message/code for support; classify so callers know whether to
// refresh (401), alert (403), retry (timeout/5xx/429), or give up (4xx).

export type ZampayErrorKind =
  | 'AUTH' // 401 — refresh token once, retry once
  | 'FORBIDDEN' // 403 — permission/scope issue, alert, do not retry
  | 'NOT_FOUND' // 404 — invoice/transaction not found
  | 'CONFLICT' // 409 — already settled / duplicate
  | 'BAD_REQUEST' // 400 — validation error, do not retry
  | 'TIMEOUT' // 5xx / network timeout — retry (may have succeeded)
  | 'RATE_LIMITED' // 429
  | 'REMOTE'
  | 'UNKNOWN';

export interface ZampayErrorMeta {
  httpStatus?: number | undefined;
  code?: string | undefined;
  message?: string | undefined;
}

export class ZampayError extends Error {
  constructor(
    readonly kind: ZampayErrorKind,
    message: string,
    readonly meta: ZampayErrorMeta = {},
  ) {
    super(message);
    this.name = 'ZampayError';
  }

  get retryable(): boolean {
    return this.kind === 'TIMEOUT' || this.kind === 'RATE_LIMITED';
  }

  /** A timeout/5xx where the request may have succeeded server-side. */
  get indeterminate(): boolean {
    return this.kind === 'TIMEOUT';
  }
}

interface ZampayBodyShape {
  message?: string;
  error?: string;
  error_description?: string;
  title?: string; // ASP.NET ProblemDetails
  detail?: string;
  code?: string;
}

export function classifyZampayError(httpStatus: number, body: unknown): ZampayError {
  const b = (body ?? {}) as ZampayBodyShape;
  const message =
    b.message ?? b.detail ?? b.error_description ?? b.error ?? b.title ?? b.code ?? `zampay http ${httpStatus}`;
  const meta: ZampayErrorMeta = { httpStatus, code: b.code, message };

  switch (httpStatus) {
    case 401:
      return new ZampayError('AUTH', message, meta);
    case 403:
      return new ZampayError('FORBIDDEN', message, meta);
    case 404:
      return new ZampayError('NOT_FOUND', message, meta);
    case 409:
      return new ZampayError('CONFLICT', message, meta);
    case 400:
    case 422:
      return new ZampayError('BAD_REQUEST', message, meta);
    case 429:
      return new ZampayError('RATE_LIMITED', message, meta);
    case 500:
    case 502:
    case 503:
    case 504:
      return new ZampayError('TIMEOUT', message, meta);
    default:
      return new ZampayError('REMOTE', message, meta);
  }
}

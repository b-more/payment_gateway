// Typed Airtel error taxonomy (§ ERROR TAXONOMY). Every remote failure is
// classified so callers can decide: alert-and-stop, feature-flag-off, retry
// with backoff, refresh-token-and-retry, or enter the UNKNOWN/enquiry flow.
//
// result_code/response_code and request_id are preserved — these are what
// Airtel support needs.

export type AirtelErrorKind =
  | 'IP_NOT_ALLOWED' // 403 "IP address not allowed" — config/ops error, do NOT retry, alert
  | 'SERVICE_NOT_ENABLED' // 403 "You cannot consume this service" — product off, feature-flag
  | 'NO_ROUTE' // 404 "no Route matched" — gateway outage, retryable w/ backoff, alert if persistent
  | 'AUTH' // 401 invalid_token — refresh once, retry once
  | 'TIMEOUT' // 504 / network timeout — UNKNOWN flow (may have succeeded server-side)
  | 'RATE_LIMITED' // 429
  | 'REMOTE' // other 4xx/5xx with a mapped Airtel body
  | 'UNKNOWN'; // anything unclassified

export interface AirtelErrorMeta {
  httpStatus?: number | undefined;
  resultCode?: string | undefined; // e.g. DP00800001001
  responseCode?: string | undefined; // e.g. ESB000010
  requestId?: string | undefined;
  ip?: string | undefined; // parsed from IP-not-allowed messages
  message?: string | undefined;
}

export class AirtelError extends Error {
  constructor(
    readonly kind: AirtelErrorKind,
    message: string,
    readonly meta: AirtelErrorMeta = {},
  ) {
    super(message);
    this.name = 'AirtelError';
  }

  /** Safe to retry the same request (idempotent GETs, or POSTs only via the UNKNOWN flow). */
  get retryable(): boolean {
    return this.kind === 'NO_ROUTE' || this.kind === 'TIMEOUT' || this.kind === 'RATE_LIMITED';
  }

  /** A timeout/5xx where the operation may have succeeded server-side. */
  get indeterminate(): boolean {
    return this.kind === 'TIMEOUT';
  }
}

interface AirtelBodyShape {
  status?: { code?: string; result_code?: string; response_code?: string; message?: string; success?: boolean };
  error?: string;
  error_description?: string;
  message?: string;
}

function extractIp(text: string): string | undefined {
  const m = /IP address not allowed[:\s]*([0-9a-fA-F:.]+)/i.exec(text);
  return m ? m[1] : undefined;
}

/** Map an HTTP status + parsed body to a typed AirtelError. */
export function classifyAirtelError(httpStatus: number, body: unknown): AirtelError {
  const b = (body ?? {}) as AirtelBodyShape;
  const status = b.status ?? {};
  const message = status.message ?? b.error_description ?? b.message ?? b.error ?? '';
  const meta: AirtelErrorMeta = {
    httpStatus,
    resultCode: status.result_code ?? status.code,
    responseCode: status.response_code,
    message,
  };
  const text = message.toLowerCase();

  if (httpStatus === 401 || b.error === 'invalid_token') {
    return new AirtelError('AUTH', message || 'invalid_token', meta);
  }
  if (httpStatus === 403 && text.includes('ip address not allowed')) {
    return new AirtelError('IP_NOT_ALLOWED', message, { ...meta, ip: extractIp(message) });
  }
  if (httpStatus === 403 && text.includes('cannot consume this service')) {
    return new AirtelError('SERVICE_NOT_ENABLED', message, meta);
  }
  if (httpStatus === 404 && text.includes('no route matched')) {
    return new AirtelError('NO_ROUTE', message, meta);
  }
  if (httpStatus === 429) {
    return new AirtelError('RATE_LIMITED', message || 'rate limited', meta);
  }
  if (httpStatus === 504 || httpStatus === 502 || httpStatus === 503) {
    return new AirtelError('TIMEOUT', message || `gateway ${httpStatus}`, meta);
  }
  return new AirtelError('REMOTE', message || `airtel http ${httpStatus}`, meta);
}

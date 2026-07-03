// Airtel HTTP client. Adds the standard headers (X-Country/X-Currency + bearer),
// enforces a timeout, performs the 401 → refresh-token-once → retry-once dance,
// captures request_id/result_code for support, and classifies every failure via
// the error taxonomy. A network/abort timeout becomes an AirtelError(TIMEOUT) so
// the caller can run the UNKNOWN/enquiry flow rather than assuming failure.

import { randomUUID } from 'node:crypto';
import { AirtelError, classifyAirtelError } from './airtel.errors';
import type { AirtelEnvConfig, AirtelGlobalConfig } from './airtel.config';
import type { AirtelTokenManager } from './airtel-token.manager';

type FetchLike = typeof fetch;

export interface AirtelResponse<T = unknown> {
  httpStatus: number;
  body: T;
  requestId: string; // our outbound X-Request-Id (echoed to logs/support)
  airtelRequestId?: string | undefined; // any request id Airtel returns
  resultCode?: string | undefined;
  responseCode?: string | undefined;
}

export class AirtelClient {
  constructor(
    private readonly config: () => AirtelEnvConfig,
    private readonly global: () => AirtelGlobalConfig,
    private readonly tokens: AirtelTokenManager,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  get<T = unknown>(path: string): Promise<AirtelResponse<T>> {
    return this.request<T>('GET', path);
  }

  post<T = unknown>(path: string, body: unknown): Promise<AirtelResponse<T>> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<AirtelResponse<T>> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.tokens.getToken(attempt > 0);
      const requestId = randomUUID();
      const res = await this.rawFetch(method, path, body, token, requestId);
      const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (res.ok) {
        // Airtel often returns HTTP 200 with a BODY-level failure
        // (status.success=false / status.code!="200"). Treat that as an error,
        // classified by the body's code, so callers don't mistake it for success.
        const st = (parsed.status ?? {}) as {
          code?: string | number;
          success?: boolean;
          result_code?: string;
          response_code?: string;
          message?: string;
        };
        const bodyFailed = st.success === false || (st.code != null && String(st.code) !== '200');
        if (bodyFailed) {
          const err = classifyAirtelError(Number(st.code) || res.status, parsed);
          err.meta.requestId = requestId;
          if (err.kind === 'AUTH' && attempt === 0) {
            this.tokens.invalidate(this.config().env);
            continue;
          }
          throw err;
        }
        return {
          httpStatus: res.status,
          body: parsed as T,
          requestId,
          airtelRequestId: res.headers.get('x-request-id') ?? undefined,
          resultCode: st.result_code ?? (st.code != null ? String(st.code) : undefined),
          responseCode: st.response_code,
        };
      }

      const err = classifyAirtelError(res.status, parsed);
      err.meta.requestId = requestId;
      if (err.kind === 'AUTH' && attempt === 0) {
        this.tokens.invalidate(this.config().env); // refresh and retry once
        continue;
      }
      throw err;
    }
    // Unreachable: the loop either returns or throws.
    throw new AirtelError('UNKNOWN', 'airtel request exhausted retries');
  }

  private async rawFetch(
    method: string,
    path: string,
    body: unknown,
    token: string,
    requestId: string,
  ): Promise<Response> {
    const cfg = this.config();
    const g = this.global();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), g.httpTimeoutMs);
    try {
      return await this.fetchImpl(`${cfg.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
          'X-Country': g.country,
          'X-Currency': g.currency,
          'X-Request-Id': requestId,
          Authorization: `Bearer ${token}`,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
    } catch (e) {
      // AbortError (timeout) or network error: indeterminate — may have succeeded.
      throw new AirtelError('TIMEOUT', e instanceof Error ? e.message : 'network error', { requestId });
    } finally {
      clearTimeout(timer);
    }
  }
}

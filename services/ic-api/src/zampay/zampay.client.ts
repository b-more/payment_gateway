// ZamPay HTTP client. Adds the bearer token, enforces a timeout, and performs
// the 401 -> refresh-token-once -> retry-once dance. Business paths are joined
// under the configured apiBasePath (e.g. /t/govzm/ebanking/v3). Every failure is
// classified via the error taxonomy; a network/abort timeout becomes a
// ZampayError(TIMEOUT) so callers can retry rather than assume failure.

import { ZampayError, classifyZampayError } from './zampay.errors';
import type { ZampayEnvConfig, ZampayGlobalConfig } from './zampay.config';
import type { ZampayTokenManager } from './zampay-token.manager';

type FetchLike = typeof fetch;

export interface ZampayResponse<T = unknown> {
  httpStatus: number;
  body: T;
}

export class ZampayClient {
  constructor(
    private readonly config: () => ZampayEnvConfig,
    private readonly global: () => ZampayGlobalConfig,
    private readonly tokens: ZampayTokenManager,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  get<T = unknown>(path: string): Promise<ZampayResponse<T>> {
    return this.request<T>('GET', path);
  }

  post<T = unknown>(path: string, body: unknown): Promise<ZampayResponse<T>> {
    return this.request<T>('POST', path, body);
  }

  patch<T = unknown>(path: string, body: unknown, headers?: Record<string, string>): Promise<ZampayResponse<T>> {
    return this.request<T>('PATCH', path, body, headers);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<ZampayResponse<T>> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.tokens.getToken(attempt > 0);
      const res = await this.rawFetch(method, path, body, token, extraHeaders);
      const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (res.ok) {
        return { httpStatus: res.status, body: parsed as T };
      }

      const err = classifyZampayError(res.status, parsed);
      if (err.kind === 'AUTH' && attempt === 0) {
        this.tokens.invalidate(this.config().env); // refresh and retry once
        continue;
      }
      throw err;
    }
    // Unreachable: the loop either returns or throws.
    throw new ZampayError('UNKNOWN', 'zampay request exhausted retries');
  }

  private async rawFetch(
    method: string,
    path: string,
    body: unknown,
    token: string,
    extraHeaders?: Record<string, string>,
  ): Promise<Response> {
    const cfg = this.config();
    const g = this.global();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), g.httpTimeoutMs);
    try {
      return await this.fetchImpl(`${cfg.baseUrl}${cfg.apiBasePath}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(extraHeaders ?? {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
    } catch (e) {
      throw new ZampayError('TIMEOUT', e instanceof Error ? e.message : 'network error');
    } finally {
      clearTimeout(timer);
    }
  }
}

// MTN HTTP client, scoped to one product (COLLECTION or DISBURSEMENT) so it
// carries that product's subscription key + token. Adds the MTN headers
// (Bearer, Ocp-Apim-Subscription-Key, X-Target-Environment, and X-Reference-Id
// on POSTs), enforces a timeout (abort -> indeterminate), does the
// 401 -> refresh-once -> retry-once dance, and tolerates MTN's 202 empty bodies.

import { MtnError, classifyMtnError } from './mtn.errors';
import type { MtnGlobalConfig, MtnProduct, MtnProductConfig } from './mtn.config';
import type { MtnTokenManager } from './mtn-token.manager';

type FetchLike = typeof fetch;

export interface MtnResponse<T = unknown> {
  httpStatus: number;
  body: T;
  referenceId?: string | undefined;
}

export interface MtnRequestOptions {
  body?: unknown;
  referenceId?: string; // X-Reference-Id (required by requesttopay / transfer)
}

export class MtnClient {
  constructor(
    private readonly product: MtnProduct,
    private readonly productConfig: (product: MtnProduct) => MtnProductConfig,
    private readonly global: () => MtnGlobalConfig,
    private readonly tokens: MtnTokenManager,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  get<T = unknown>(path: string): Promise<MtnResponse<T>> {
    return this.request<T>('GET', path, {});
  }

  post<T = unknown>(path: string, opts: MtnRequestOptions): Promise<MtnResponse<T>> {
    return this.request<T>('POST', path, opts);
  }

  private async request<T>(method: string, path: string, opts: MtnRequestOptions): Promise<MtnResponse<T>> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.tokens.getToken(this.product, attempt > 0);
      const res = await this.rawFetch(method, path, opts, token);
      const text = await res.text().catch(() => '');
      const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};

      if (res.ok) {
        return { httpStatus: res.status, body: parsed as T, referenceId: opts.referenceId };
      }
      const err = classifyMtnError(res.status, parsed);
      err.meta.referenceId = opts.referenceId;
      if (err.kind === 'AUTH' && attempt === 0) {
        this.tokens.invalidate(this.product);
        continue;
      }
      throw err;
    }
    throw new MtnError('UNKNOWN', 'mtn request exhausted retries');
  }

  private async rawFetch(
    method: string,
    path: string,
    opts: MtnRequestOptions,
    token: string,
  ): Promise<Response> {
    const cfg = this.productConfig(this.product);
    const g = this.global();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), g.httpTimeoutMs);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Ocp-Apim-Subscription-Key': cfg.subscriptionKey,
      'X-Target-Environment': g.targetEnvironment,
      'Content-Type': 'application/json',
    };
    if (opts.referenceId) headers['X-Reference-Id'] = opts.referenceId;
    try {
      return await this.fetchImpl(`${cfg.baseUrl}${path}`, {
        method,
        headers,
        ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
        signal: controller.signal,
      });
    } catch (e) {
      throw new MtnError('TIMEOUT', e instanceof Error ? e.message : 'network error', {
        referenceId: opts.referenceId,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

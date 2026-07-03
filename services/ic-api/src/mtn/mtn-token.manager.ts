// MTN per-product token manager. Each product (COLLECTION / DISBURSEMENT) has
// its own token, fetched from POST /{product}/token/ with Basic auth
// (base64(apiUser:apiKey)) + the product's Ocp-Apim-Subscription-Key. Tokens last
// ~3600s; this caches per (env, product), refreshes proactively, serialises
// concurrent refreshes (single-flight), and supports a forced refresh (401 path).

import { classifyMtnError } from './mtn.errors';
import { assertMtnProductCredentials, type MtnProduct, type MtnProductConfig } from './mtn.config';

type FetchLike = typeof fetch;

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

export class MtnTokenManager {
  private readonly cache = new Map<string, CachedToken>();
  private readonly inflight = new Map<string, Promise<string>>();

  constructor(
    private readonly productConfig: (product: MtnProduct) => MtnProductConfig,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = () => Date.now(),
    /** Refresh when fewer than this many ms remain. */
    private readonly skewMs = 60_000,
  ) {}

  async getToken(product: MtnProduct, force = false): Promise<string> {
    const cfg = this.productConfig(product);
    const key = `${cfg.env}:${product}`;
    const cached = this.cache.get(key);
    if (!force && cached && cached.expiresAtMs - this.now() > this.skewMs) {
      return cached.token;
    }
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const p = this.refresh(cfg, key).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  invalidate(product?: MtnProduct): void {
    if (!product) {
      this.cache.clear();
      return;
    }
    for (const key of [...this.cache.keys()]) {
      if (key.endsWith(`:${product}`)) this.cache.delete(key);
    }
  }

  private async refresh(cfg: MtnProductConfig, key: string): Promise<string> {
    assertMtnProductCredentials(cfg);
    const basic = Buffer.from(`${cfg.apiUser}:${cfg.apiKey}`).toString('base64');
    const res = await this.fetchImpl(`${cfg.baseUrl}${cfg.tokenPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Ocp-Apim-Subscription-Key': cfg.subscriptionKey,
        'Content-Type': 'application/json',
      },
    });
    const body = (await res.json().catch(() => ({}))) as TokenResponse;
    if (!res.ok || !body.access_token) {
      throw classifyMtnError(res.status, body);
    }
    const expiresIn = Number(body.expires_in ?? 3600);
    this.cache.set(key, { token: body.access_token, expiresAtMs: this.now() + expiresIn * 1000 });
    return body.access_token;
  }
}

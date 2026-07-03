// Airtel OAuth token manager (§ AUTH — CRITICAL).
//
// Tokens live only 180 SECONDS. This caches per Airtel environment, refreshes
// proactively (default: when <30s remain, i.e. ~150s in), serialises concurrent
// refreshes (single-flight — no thundering herd), and supports a forced refresh
// for the 401 → refresh-once → retry path in the client.
//
// `now` and `fetchImpl` are injectable so the timing/single-flight logic is unit
// tested without a clock or network.

import { classifyAirtelError } from './airtel.errors';
import type { AirtelEnv, AirtelEnvConfig } from './airtel.config';
import { assertAirtelCredentials } from './airtel.config';

type FetchLike = typeof fetch;

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
}

export class AirtelTokenManager {
  private readonly cache = new Map<AirtelEnv, CachedToken>();
  private readonly inflight = new Map<AirtelEnv, Promise<string>>();

  constructor(
    private readonly config: () => AirtelEnvConfig,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = () => Date.now(),
    /** Refresh when fewer than this many ms remain (proactive refresh). */
    private readonly skewMs = 30_000,
  ) {}

  /** Return a valid bearer token, refreshing (single-flight) if needed. */
  async getToken(force = false): Promise<string> {
    const cfg = this.config();
    const cached = this.cache.get(cfg.env);
    if (!force && cached && cached.expiresAtMs - this.now() > this.skewMs) {
      return cached.token;
    }
    const existing = this.inflight.get(cfg.env);
    if (existing) return existing;

    const p = this.refresh(cfg).finally(() => this.inflight.delete(cfg.env));
    this.inflight.set(cfg.env, p);
    return p;
  }

  /** Drop the cached token (e.g. after a 401) so the next call re-authenticates. */
  invalidate(env?: AirtelEnv): void {
    if (env) this.cache.delete(env);
    else this.cache.clear();
  }

  private async refresh(cfg: AirtelEnvConfig): Promise<string> {
    assertAirtelCredentials(cfg);
    const res = await this.fetchImpl(`${cfg.baseUrl}/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: '*/*' },
      body: JSON.stringify({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: 'client_credentials',
      }),
    });
    const body = (await res.json().catch(() => ({}))) as TokenResponse;
    if (!res.ok || !body.access_token) {
      throw classifyAirtelError(res.status, body);
    }
    const expiresIn = Number(body.expires_in ?? 180);
    this.cache.set(cfg.env, {
      token: body.access_token,
      expiresAtMs: this.now() + expiresIn * 1000,
    });
    return body.access_token;
  }
}

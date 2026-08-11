// ZamPay OAuth token manager.
//
// Login (`POST /oauth/login` with {username,password}) returns a JWT plus a
// longer-lived refresh token:
//   { token, expires: <ISO>, refreshToken: { token, expires, created } }
// Access tokens live ~1h. This caches the JWT, refreshes proactively (default:
// when <60s remain), serialises concurrent refreshes (single-flight), and
// supports a forced refresh for the 401 -> refresh-once -> retry path in the
// client. When a refresh token is held it prefers `POST /oauth/refresh`; on any
// failure it falls back to a full re-login.
//
// `now` and `fetchImpl` are injectable so the timing/single-flight logic is unit
// tested without a clock or network.

import { classifyZampayError } from './zampay.errors';
import type { ZampayEnv, ZampayEnvConfig } from './zampay.config';
import { assertZampayCredentials } from './zampay.config';

type FetchLike = typeof fetch;

interface CachedToken {
  token: string;
  expiresAtMs: number;
  refreshToken?: string;
}

interface LoginResponse {
  token?: string;
  expires?: string; // ISO8601
  refreshToken?: { token?: string; expires?: string };
}

export class ZampayTokenManager {
  private readonly cache = new Map<ZampayEnv, CachedToken>();
  private readonly inflight = new Map<ZampayEnv, Promise<string>>();

  constructor(
    private readonly config: () => ZampayEnvConfig,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = () => Date.now(),
    /** Refresh when fewer than this many ms remain (proactive refresh). */
    private readonly skewMs = 60_000,
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
  invalidate(env?: ZampayEnv): void {
    if (env) this.cache.delete(env);
    else this.cache.clear();
  }

  private async refresh(cfg: ZampayEnvConfig): Promise<string> {
    assertZampayCredentials(cfg);
    // Prefer a refresh-token exchange if we hold one; fall back to full login.
    const held = this.cache.get(cfg.env)?.refreshToken;
    if (held) {
      const viaRefresh = await this.tryRefreshToken(cfg, held).catch(() => null);
      if (viaRefresh) return viaRefresh;
    }
    return this.login(cfg);
  }

  private async login(cfg: ZampayEnvConfig): Promise<string> {
    const res = await this.fetchImpl(`${cfg.baseUrl}/oauth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username: cfg.username, password: cfg.password }),
    });
    const body = (await res.json().catch(() => ({}))) as LoginResponse;
    if (!res.ok || !body.token) throw classifyZampayError(res.status, body);
    return this.store(cfg.env, body);
  }

  private async tryRefreshToken(cfg: ZampayEnvConfig, refreshToken: string): Promise<string> {
    const authToken = this.cache.get(cfg.env)?.token ?? '';
    const res = await this.fetchImpl(`${cfg.baseUrl}/oauth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ authenticationToken: authToken, refreshToken }),
    });
    const body = (await res.json().catch(() => ({}))) as LoginResponse;
    if (!res.ok || !body.token) throw classifyZampayError(res.status, body);
    return this.store(cfg.env, body);
  }

  /** Cache the token; derive expiry from the ISO `expires`, defaulting to 1h. */
  private store(env: ZampayEnv, body: LoginResponse): string {
    const parsed = body.expires ? Date.parse(body.expires) : NaN;
    const expiresAtMs = Number.isFinite(parsed) ? parsed : this.now() + 3_600_000;
    const entry: CachedToken = { token: body.token as string, expiresAtMs };
    if (body.refreshToken?.token) entry.refreshToken = body.refreshToken.token;
    this.cache.set(env, entry);
    return body.token as string;
  }
}

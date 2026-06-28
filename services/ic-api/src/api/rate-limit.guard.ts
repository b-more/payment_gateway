import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { RateLimitError } from '../money/errors';
import { getClientIp, getHeader } from './request-context';
import type { AuthedRequest } from './request-context';

const WINDOW_MS = Number(process.env.API_RATE_WINDOW_MS ?? 60_000);
const MAX_PER_WINDOW = Number(process.env.API_RATE_MAX ?? 120);

/**
 * Per api-key + per-IP fixed-window rate limit (SEC-API6). This in-memory store
 * is per-process; production backs the counters with Redis so limits hold across
 * replicas. Keyed before auth so floods are shed cheaply.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const key = `${getHeader(req, 'x-api-key') ?? 'anon'}:${getClientIp(req) ?? 'noip'}`;
    const now = Date.now();

    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
      this.sweep(now);
      return true;
    }
    if (entry.count >= MAX_PER_WINDOW) {
      throw new RateLimitError();
    }
    entry.count += 1;
    return true;
  }

  // Opportunistic cleanup so the map cannot grow without bound.
  private sweep(now: number): void {
    if (this.hits.size < 10_000) return;
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(key);
    }
  }
}

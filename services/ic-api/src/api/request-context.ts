import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { CredentialContext } from '../credentials/credential.service';
import { InvalidSignatureError, ValidationError } from '../money/errors';

export interface AuthedRequest extends Request {
  rawBody?: Buffer;
  credential?: CredentialContext;
}

export function getHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function getClientIp(req: Request): string | null {
  // SECURITY (SEC-API4): use ONLY the value our own Nginx computed, never a
  // header the caller can set. Nginx resolves $remote_addr via the real_ip
  // module — it honours CF-Connecting-IP solely when the peer is genuinely a
  // Cloudflare address, so a forged header on a direct-to-origin connection is
  // ignored — and then *sets* (not appends) X-Real-IP from it.
  //
  // Reading cf-connecting-ip / x-forwarded-for straight off the request used to
  // let anyone bypass the live-key IP allowlist with one spoofed header, because
  // Nginx passed CF-Connecting-IP through untouched and $proxy_add_x_forwarded_for
  // *appends* to whatever the client sent (leaving the attacker's value first).
  const realIp = getHeader(req, 'x-real-ip');
  if (realIp) return realIp.trim();
  // No proxy in front (local/dev): fall back to the socket peer, which cannot be forged.
  return req.socket?.remoteAddress ?? req.ip ?? null;
}

/** Mutating endpoints require an Idempotency-Key (IDEM-1). */
export function requireIdempotencyKey(req: Request): string {
  const key = getHeader(req, 'idempotency-key');
  if (!key || key.trim() === '') {
    throw new ValidationError('Idempotency-Key header is required');
  }
  return key.trim();
}

/** Inject the authenticated credential context resolved by ApiAuthGuard. */
export const CurrentCredential = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CredentialContext => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.credential) throw new InvalidSignatureError();
    return req.credential;
  },
);

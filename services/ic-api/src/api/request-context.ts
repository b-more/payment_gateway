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
  // Behind the Cloudflare proxy, the true client IP is CF-Connecting-IP (DNS-2);
  // the edge Nginx also forwards it into X-Forwarded-For.
  const cf = getHeader(req, 'cf-connecting-ip');
  if (cf) return cf.trim();
  const forwarded = getHeader(req, 'x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip ?? null;
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

import { createHmac, timingSafeEqual } from 'node:crypto';
import { UnauthorizedError } from '../money/errors';

// Minimal HS256 JWT for stateless access tokens (SEC-A3). The algorithm is
// pinned to HS256 on verify to prevent algorithm-confusion attacks.

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function b64urlJson(value: unknown): string {
  return b64url(JSON.stringify(value));
}

export function signJwt(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds: number,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: now, exp: now + expiresInSeconds };
  const data = `${b64urlJson(header)}.${b64urlJson(body)}`;
  const signature = createHmac('sha256', secret).update(data).digest();
  return `${data}.${b64url(signature)}`;
}

export function verifyJwt<T>(token: string, secret: string): T {
  const parts = token.split('.');
  if (parts.length !== 3) throw new UnauthorizedError();
  const [headerPart, payloadPart, signaturePart] = parts;

  let header: { alg?: unknown };
  try {
    header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')) as { alg?: unknown };
  } catch {
    throw new UnauthorizedError();
  }
  if (header.alg !== 'HS256') throw new UnauthorizedError();

  const expected = createHmac('sha256', secret).update(`${headerPart}.${payloadPart}`).digest();
  const provided = Buffer.from(signaturePart, 'base64url');
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new UnauthorizedError();
  }

  const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as T & {
    exp?: number;
  };
  if (typeof payload.exp === 'number' && Math.floor(Date.now() / 1000) >= payload.exp) {
    throw new UnauthorizedError('token expired');
  }
  return payload;
}

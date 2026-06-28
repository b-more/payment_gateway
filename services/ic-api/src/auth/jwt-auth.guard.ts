import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { verifyJwt } from './jwt';
import { parseCookies, accessCookieName } from './cookies';
import { UnauthorizedError } from '../money/errors';
import type { AuthedPortalRequest, Principal } from './principal';
import { getHeader } from '../api/request-context';

interface JwtClaims {
  sub: string;
  scope: 'SYSTEM' | 'MERCHANT';
  merchantId: string | null;
  roles: string[];
}

function accessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is not set');
  return secret;
}

/**
 * Verifies the portal access token (from the realm session cookie or a Bearer
 * header) and attaches the principal. Scope/role enforcement is the RolesGuard.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedPortalRequest>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedError();

    const claims = verifyJwt<JwtClaims>(token, accessSecret());
    const principal: Principal = {
      userId: claims.sub,
      scope: claims.scope,
      merchantId: claims.merchantId,
      roles: Array.isArray(claims.roles) ? claims.roles : [],
    };
    req.principal = principal;
    return true;
  }

  private extractToken(req: AuthedPortalRequest): string | null {
    const auth = getHeader(req, 'authorization');
    if (auth && auth.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
    const cookies = parseCookies(getHeader(req, 'cookie'));
    return cookies[accessCookieName('admin')] ?? cookies[accessCookieName('merchant')] ?? null;
  }
}

import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, SCOPE_KEY, type AuthedPortalRequest } from './principal';
import { ForbiddenError, UnauthorizedError } from '../money/errors';
import type { ActorScope } from '../money/types';

/**
 * Server-side authorization (SEC-Z1). Enforces the required realm/scope (SEC-A4)
 * and that the principal holds at least one required role (SEC-Z3). Runs after
 * JwtAuthGuard, which sets the principal.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const scope = this.reflector.getAllAndOverride<ActorScope | undefined>(SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest<AuthedPortalRequest>();
    const principal = req.principal;
    if (!principal) throw new UnauthorizedError();

    if (scope && principal.scope !== scope) {
      throw new ForbiddenError('wrong realm');
    }
    if (required && required.length > 0 && !required.some((role) => principal.roles.includes(role))) {
      throw new ForbiddenError('insufficient role');
    }
    return true;
  }
}

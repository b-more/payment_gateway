import {
  SetMetadata,
  createParamDecorator,
  type CustomDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import type { ActorScope } from '../money/types';
import { UnauthorizedError } from '../money/errors';

export interface Principal {
  userId: string;
  scope: ActorScope;
  merchantId: string | null;
  roles: string[];
}

export interface AuthedPortalRequest extends Request {
  principal?: Principal;
}

export const ROLES_KEY = 'auth:roles';
export const SCOPE_KEY = 'auth:scope';

/** Require the principal to hold at least one of these roles (SEC-Z1/Z3). */
export const Roles = (...roles: string[]): CustomDecorator => SetMetadata(ROLES_KEY, roles);

/** Require the principal's realm/scope (SEC-A4 separation). */
export const RequireScope = (scope: ActorScope): CustomDecorator => SetMetadata(SCOPE_KEY, scope);

/** Inject the authenticated principal resolved by JwtAuthGuard. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const req = ctx.switchToHttp().getRequest<AuthedPortalRequest>();
    if (!req.principal) throw new UnauthorizedError();
    return req.principal;
  },
);

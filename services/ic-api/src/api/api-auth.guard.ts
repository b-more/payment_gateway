import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { CredentialService } from '../credentials/credential.service';
import { AuthedRequest, getClientIp, getHeader } from './request-context';

/**
 * Authenticates every /v1 request. Two modes are supported — both resolve to the
 * same CredentialContext and both enforce the live-key IP allowlist (SEC-API4):
 *
 *  1. SIGNED (SEC-API2/3) — `X-Api-Key` + `X-Timestamp` + `X-Signature`, an HMAC
 *     over `ts.METHOD.path.rawBody`. Stronger: adds replay protection and body
 *     integrity. Chosen whenever an `X-Signature` header is present.
 *
 *  2. SIMPLE (SEC-API2b) — `X-Api-Key` + the secret, sent as `X-Api-Secret` or
 *     `Authorization: Bearer <secret>`. The familiar key+secret-over-TLS model;
 *     far easier to integrate. No replay window, so signing stays the stronger
 *     option for high-value integrations.
 *
 * Signing is preferred when both are present. An attacker stripping the
 * signature does not downgrade anyone: the secret is a separate credential they
 * would still need, and without it the request simply fails.
 */
@Injectable()
export class ApiAuthGuard implements CanActivate {
  constructor(private readonly credentials: CredentialService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const signature = getHeader(req, 'x-signature');

    if (signature) {
      req.credential = await this.credentials.authenticate({
        apiKey: getHeader(req, 'x-api-key'),
        timestamp: getHeader(req, 'x-timestamp'),
        signature,
        method: req.method,
        path: req.originalUrl,
        rawBody: req.rawBody ? req.rawBody.toString('utf8') : '',
        clientIp: getClientIp(req),
      });
      return true;
    }

    req.credential = await this.credentials.authenticateWithSecret({
      apiKey: getHeader(req, 'x-api-key'),
      secret: bearerOrSecretHeader(req),
      clientIp: getClientIp(req),
    });
    return true;
  }
}

/** Secret from `Authorization: Bearer <secret>`, else the `X-Api-Secret` header. */
function bearerOrSecretHeader(req: AuthedRequest): string | undefined {
  const auth = getHeader(req, 'authorization');
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) return m[1];
  }
  return getHeader(req, 'x-api-secret');
}

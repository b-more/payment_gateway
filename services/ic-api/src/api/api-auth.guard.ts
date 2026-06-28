import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { CredentialService } from '../credentials/credential.service';
import { AuthedRequest, getClientIp, getHeader } from './request-context';

/**
 * Authenticates every /v1 request via api_key + HMAC signature + timestamp
 * (SEC-API2/3), enforcing the live-key IP whitelist (SEC-API4). On success the
 * resolved CredentialContext is attached to the request for controllers.
 */
@Injectable()
export class ApiAuthGuard implements CanActivate {
  constructor(private readonly credentials: CredentialService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    req.credential = await this.credentials.authenticate({
      apiKey: getHeader(req, 'x-api-key'),
      timestamp: getHeader(req, 'x-timestamp'),
      signature: getHeader(req, 'x-signature'),
      method: req.method,
      path: req.originalUrl,
      rawBody: req.rawBody ? req.rawBody.toString('utf8') : '',
      clientIp: getClientIp(req),
    });
    return true;
  }
}

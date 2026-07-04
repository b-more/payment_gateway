import { Body, Controller, HttpCode, Logger, Post, Req, UseGuards, type RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RateLimitGuard } from '../api/rate-limit.guard';
import { AirtelDispatchService } from './airtel-dispatch.service';
import { airtelCallbackConfig } from './airtel.config';
import { checkCallbackHash } from './airtel-callback.crypto';

// Airtel transaction callback receiver. Public (Airtel calls it) and rate-limited.
// Signature-agnostic for now but structured so "Callback With Authentication" can
// be added later. On callback we look up the matching attempt and resolve it via
// an authoritative enquiry — the callback body's status is NOT trusted for money
// decisions while it is unauthenticated. Always acks 200 (Airtel retries on non-2xx).
interface AirtelCallbackBody {
  transaction?: { id?: string; airtel_money_id?: string; status?: string; message?: string };
  data?: { transaction?: { id?: string; airtel_money_id?: string; status?: string } };
  hash?: string; // present when callback auth is enabled (verified later)
}

@ApiTags('processors')
@Controller('processors/airtel')
@UseGuards(RateLimitGuard)
export class AirtelCallbackController {
  private readonly logger = new Logger(AirtelCallbackController.name);

  constructor(private readonly dispatch: AirtelDispatchService) {}

  @Post('callback')
  @HttpCode(200)
  @ApiOperation({ summary: 'Airtel transaction callback (async result)' })
  async callback(
    @Body() body: AirtelCallbackBody,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: boolean; matched: boolean }> {
    // Callback With Authentication (§ HMAC). Log-only until the scheme is
    // confirmed, then AIRTEL_CALLBACK_HASH_ENFORCE=true rejects forged callbacks
    // before they consume an enquiry.
    const cb = airtelCallbackConfig();
    if (cb.hashKey) {
      const raw = req.rawBody instanceof Buffer ? req.rawBody.toString('utf8') : JSON.stringify(body);
      const chk = checkCallbackHash(cb.hashKey, raw, body);
      const short = Object.fromEntries(Object.entries(chk.candidates).map(([k, v]) => [k, v.slice(0, 12)]));
      this.logger.log(
        `airtel callback hash: provided=${chk.provided ?? 'none'} matched=${chk.matched ?? 'NONE'} enforce=${cb.enforce} candidates=${JSON.stringify(short)}`,
      );
      if (cb.enforce && !chk.matched) {
        this.logger.warn('airtel callback REJECTED — hash mismatch (enforce on)');
        return { received: true, matched: false };
      }
    }

    const t = body.transaction ?? body.data?.transaction ?? {};
    const ourId = t.id ?? null;
    const moneyId = t.airtel_money_id ?? null;
    let matched = false;
    try {
      matched = await this.dispatch.resolveFromCallback({ ourId, moneyId });
    } catch (e) {
      // Never fail the ack — the reconciliation job is the backstop.
      this.logger.error(`airtel callback resolve failed (id=${ourId ?? moneyId ?? '?'}): ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!matched) this.logger.warn(`airtel callback did not match an attempt (id=${ourId ?? moneyId ?? '?'})`);
    return { received: true, matched };
  }
}

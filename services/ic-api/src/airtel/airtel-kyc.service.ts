// Airtel KYC user enquiry (§5). GET /standard/v1/users/{msisdn} as a pre-payment
// validation: warn/block if the subscriber is barred, has no PIN set, or is not
// registered.
//
// This returns PERSONAL DATA, so:
//   - we return only a minimal summary (the payer's display name + a canPay
//     decision + machine reasons) — never the raw Airtel payload,
//   - nothing here logs the body (callers must not log the summary's name),
//   - the HTTP endpoint that exposes this is restricted to authenticated staff
//     roles (wired with the controller).

import { zmSubscriberMsisdn } from './airtel-response';
import type { AirtelResponse } from './airtel.client';

interface AirtelHttp {
  get<T = unknown>(path: string): Promise<AirtelResponse<T>>;
}

interface AirtelKycBody {
  data?: {
    first_name?: string;
    last_name?: string;
    grade?: string;
    is_barred?: boolean;
    is_pin_set?: boolean;
    registration?: { status?: string };
  };
}

export type KycReason = 'NOT_REGISTERED' | 'BARRED' | 'PIN_NOT_SET' | 'LOOKUP_FAILED';

export interface KycSummary {
  msisdn: string; // the 9-digit subscriber number checked
  registered: boolean;
  name: string | null; // "First Last" — minimal, for payer confirmation only
  canPay: boolean;
  reasons: KycReason[]; // machine-readable warnings/blocks
}

function isRegistered(status: string | undefined): boolean {
  // Exact token confirmed during UAT; treat REGISTERED/ACTIVE as registered.
  const s = (status ?? '').toUpperCase();
  return s === 'REGISTERED' || s === 'ACTIVE';
}

export class AirtelKycService {
  constructor(private readonly http: AirtelHttp) {}

  /**
   * Validate a payer number. Advisory and non-throwing so it can be used as a
   * pre-check without breaking the payment flow; a failed lookup yields
   * canPay=false + LOOKUP_FAILED so the caller can warn or block per policy.
   */
  async validatePayer(msisdn: string): Promise<KycSummary> {
    const sub = zmSubscriberMsisdn(msisdn);
    let body: AirtelKycBody['data'];
    try {
      const res = await this.http.get<AirtelKycBody>(`/standard/v1/users/${sub}`);
      body = res.body.data;
    } catch {
      // Lookup unavailable — advisory failure, never leak the underlying error.
      return { msisdn: sub, registered: false, name: null, canPay: false, reasons: ['LOOKUP_FAILED'] };
    }

    const registered = isRegistered(body?.registration?.status);
    const barred = body?.is_barred === true;
    const pinSet = body?.is_pin_set === true;

    const reasons: KycReason[] = [];
    if (!registered) reasons.push('NOT_REGISTERED');
    if (barred) reasons.push('BARRED');
    if (!pinSet) reasons.push('PIN_NOT_SET');

    const name = [body?.first_name, body?.last_name].filter(Boolean).join(' ').trim() || null;
    return { msisdn: sub, registered, name, canPay: reasons.length === 0, reasons };
  }
}

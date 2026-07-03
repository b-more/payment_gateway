// Airtel Balance Enquiry (§6). Currently returns 403 "You cannot consume this
// service" until Airtel enables it on our profile, so it's behind a feature flag
// (AIRTEL_BALANCE_ENABLED) with graceful degradation: callers get a structured
// "unavailable" result rather than an error, and it lights up when Airtel enables it.

import { AirtelError } from './airtel.errors';
import { kwachaToNgwee } from './money';
import type { AirtelResponse } from './airtel.client';
import type { AirtelGlobalConfig } from './airtel.config';

interface AirtelHttp {
  get<T = unknown>(path: string): Promise<AirtelResponse<T>>;
}

interface AirtelBalanceBody {
  data?: { balance?: string | number; available_balance?: string | number; currency?: string };
}

export type BalanceType = 'COLL' | 'DISB';

export type BalanceResult =
  | { available: true; type: BalanceType; balanceNgwee: bigint; currency: string | null }
  | { available: false; type: BalanceType; reason: 'FEATURE_DISABLED' | 'NOT_ENABLED_ON_PROFILE' };

export class AirtelBalanceService {
  constructor(
    private readonly http: AirtelHttp,
    private readonly global: () => AirtelGlobalConfig,
  ) {}

  async balance(type: BalanceType): Promise<BalanceResult> {
    if (!this.global().balanceEnabled) {
      return { available: false, type, reason: 'FEATURE_DISABLED' };
    }
    try {
      const res = await this.http.get<AirtelBalanceBody>(`/standard/v2/users/balance?type=${type}`);
      const raw = res.body.data?.balance ?? res.body.data?.available_balance ?? '0';
      return {
        available: true,
        type,
        balanceNgwee: kwachaToNgwee(raw),
        currency: res.body.data?.currency ?? this.global().currency,
      };
    } catch (e) {
      if (e instanceof AirtelError && e.kind === 'SERVICE_NOT_ENABLED') {
        return { available: false, type, reason: 'NOT_ENABLED_ON_PROFILE' };
      }
      throw e;
    }
  }
}

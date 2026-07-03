// Airtel Zambia Open API — environment configuration (§ integration brief).
//
// Base URL, credentials, PIN and RSA public key are ALL swappable per Airtel
// environment via env vars, selected by AIRTEL_ENV (PRODUCTION | STAGING).
// Staging (openapiuat) is unreliable, so this indirection lets us point live
// dispatch at whichever environment is healthy without code changes.
//
// Only merchant accounts in PRODUCTION operating_mode reach Airtel at all;
// SANDBOX accounts keep the local simulator (TXN-5). This selector is about
// WHICH Airtel environment our live dispatch talks to.

export type AirtelEnv = 'PRODUCTION' | 'STAGING';

export interface AirtelEnvConfig {
  env: AirtelEnv;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  /** base64 DER/SPKI 1024-bit RSA public key for disbursement PIN encryption. */
  publicKeyBase64: string;
  /** 4-digit wallet PIN for B2C disbursements. Never logged. */
  disbursePin: string;
}

export interface AirtelGlobalConfig {
  enabled: boolean;
  country: string; // ZM
  currency: string; // ZMW
  balanceEnabled: boolean; // Balance Enquiry feature flag (403 until Airtel enables)
  httpTimeoutMs: number;
}

function env(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim();
}

export function airtelGlobalConfig(): AirtelGlobalConfig {
  return {
    enabled: env('AIRTEL_ENABLED') === 'true',
    country: env('AIRTEL_COUNTRY', 'ZM'),
    currency: env('AIRTEL_CURRENCY', 'ZMW'),
    balanceEnabled: env('AIRTEL_BALANCE_ENABLED') === 'true',
    httpTimeoutMs: Number(env('AIRTEL_HTTP_TIMEOUT_MS', '15000')),
  };
}

/** Which Airtel environment live dispatch currently targets. */
export function activeAirtelEnv(): AirtelEnv {
  return env('AIRTEL_ENV', 'STAGING').toUpperCase() === 'PRODUCTION' ? 'PRODUCTION' : 'STAGING';
}

/** Resolve the active Airtel environment profile from env. */
export function airtelEnvConfig(): AirtelEnvConfig {
  const e = activeAirtelEnv();
  const p = e === 'PRODUCTION' ? 'PROD' : 'STAGING';
  const defaultBase = e === 'PRODUCTION' ? 'https://openapi.airtel.co.zm' : 'https://openapiuat.airtel.co.zm';
  return {
    env: e,
    baseUrl: env(`AIRTEL_${p}_BASE_URL`, defaultBase),
    clientId: env(`AIRTEL_${p}_CLIENT_ID`),
    clientSecret: env(`AIRTEL_${p}_CLIENT_SECRET`),
    publicKeyBase64: env(`AIRTEL_${p}_PUBLIC_KEY`),
    disbursePin: env(`AIRTEL_${p}_DISBURSE_PIN`),
  };
}

/** Assert the credentials needed for API calls are present (call before use). */
export function assertAirtelCredentials(cfg: AirtelEnvConfig): void {
  const missing: string[] = [];
  if (!cfg.baseUrl) missing.push('baseUrl');
  if (!cfg.clientId) missing.push('clientId');
  if (!cfg.clientSecret) missing.push('clientSecret');
  if (missing.length > 0) {
    throw new Error(`Airtel ${cfg.env} config incomplete: missing ${missing.join(', ')}`);
  }
}

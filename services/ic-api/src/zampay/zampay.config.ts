// ZamPay (GSB / dotGov "ZamConnect") — environment configuration.
//
// ZamPay is the settlement orchestrator for government collections. We act as a
// payment processor: after we collect for GSB, we read the invoice, learn the
// destination bank account, and (once an operator has wired the funds) send a
// settlement callback. This config is swappable per ZamPay environment via
// ZAMPAY_ENV (TEST | PRODUCTION).
//
// Auth is username/password OAuth at `${baseUrl}/oauth/login` (returns a JWT +
// refresh token). All business endpoints live under `${baseUrl}${apiBasePath}`,
// e.g. https://api.test.gsb.gov.zm/t/govzm/ebanking/v3.

export type ZampayEnv = 'TEST' | 'PRODUCTION';

export interface ZampayEnvConfig {
  env: ZampayEnv;
  baseUrl: string; // host only, e.g. https://api.test.gsb.gov.zm
  apiBasePath: string; // e.g. /t/govzm/ebanking/v3
  username: string;
  password: string;
}

export interface ZampayGlobalConfig {
  enabled: boolean;
  currency: string; // ZMW
  httpTimeoutMs: number;
  /** Value for the `IdentityName` header on the settlement callback. */
  identityName: string;
  /**
   * The ONE account number ZamPay settlement is allowed to touch (GSB). The
   * reconcile job only ever discovers collections on this account; combined with
   * the DB constraint that at most one account may be flag-enabled, this makes
   * the feature single-account by construction. Empty => discover nothing.
   */
  accountNumber: string;
}

function env(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim();
}

export function zampayGlobalConfig(): ZampayGlobalConfig {
  return {
    enabled: env('ZAMPAY_ENABLED') === 'true',
    currency: env('ZAMPAY_CURRENCY', 'ZMW'),
    httpTimeoutMs: Number(env('ZAMPAY_HTTP_TIMEOUT_MS', '15000')),
    identityName: env('ZAMPAY_IDENTITY_NAME', 'instacompaymobile'),
    accountNumber: env('ZAMPAY_ACCOUNT_NUMBER'),
  };
}

/** Which ZamPay environment our settlement orchestration targets. */
export function activeZampayEnv(): ZampayEnv {
  return env('ZAMPAY_ENV', 'TEST').toUpperCase() === 'PRODUCTION' ? 'PRODUCTION' : 'TEST';
}

/** Resolve the active ZamPay environment profile from env. */
export function zampayEnvConfig(): ZampayEnvConfig {
  const e = activeZampayEnv();
  const p = e === 'PRODUCTION' ? 'PROD' : 'TEST';
  const defaultBase = e === 'PRODUCTION' ? 'https://api.gsb.gov.zm' : 'https://api.test.gsb.gov.zm';
  return {
    env: e,
    baseUrl: env(`ZAMPAY_${p}_BASE_URL`, defaultBase),
    apiBasePath: env(`ZAMPAY_${p}_API_BASE_PATH`, '/t/govzm/ebanking/v3'),
    username: env(`ZAMPAY_${p}_USERNAME`),
    password: env(`ZAMPAY_${p}_PASSWORD`),
  };
}

/** Assert the credentials needed for OAuth are present (call before use). */
export function assertZampayCredentials(cfg: ZampayEnvConfig): void {
  const missing: string[] = [];
  if (!cfg.baseUrl) missing.push('baseUrl');
  if (!cfg.username) missing.push('username');
  if (!cfg.password) missing.push('password');
  if (missing.length > 0) {
    throw new Error(`ZamPay ${cfg.env} config incomplete: missing ${missing.join(', ')}`);
  }
}

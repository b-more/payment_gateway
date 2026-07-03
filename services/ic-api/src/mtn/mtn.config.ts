// MTN MoMo Open API — configuration (base URL: https://proxy.momoapi.mtn.com).
//
// Unlike Airtel's single OAuth client, MTN auth is PER PRODUCT: Collection and
// Disbursement each have their own Subscription Key + API User + API Key, and a
// token is fetched per product (POST /collection/token/, /disbursement/token/)
// with Basic auth = base64(apiUser:apiKey) + the subscription-key header.
//
// Every call also carries X-Target-Environment (e.g. "mtnzambia") and the
// product's Ocp-Apim-Subscription-Key. Only PRODUCTION-mode accounts reach MTN;
// SANDBOX accounts keep the simulator.

export type MtnEnv = 'PRODUCTION' | 'SANDBOX';
export type MtnProduct = 'COLLECTION' | 'DISBURSEMENT';

export interface MtnProductConfig {
  product: MtnProduct;
  env: MtnEnv;
  baseUrl: string;
  subscriptionKey: string;
  apiUser: string;
  apiKey: string;
  tokenPath: string; // /collection/token/ or /disbursement/token/
}

export interface MtnGlobalConfig {
  enabled: boolean;
  targetEnvironment: string; // X-Target-Environment, e.g. mtnzambia
  currency: string; // ZMW
  httpTimeoutMs: number;
}

function env(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim();
}

export function mtnEnv(): MtnEnv {
  return env('MTN_ENV', 'PRODUCTION').toUpperCase() === 'SANDBOX' ? 'SANDBOX' : 'PRODUCTION';
}

export function mtnGlobalConfig(): MtnGlobalConfig {
  return {
    enabled: env('MTN_ENABLED') === 'true',
    targetEnvironment: env('MTN_TARGET_ENVIRONMENT', 'mtnzambia'),
    currency: env('MTN_CURRENCY', 'ZMW'),
    httpTimeoutMs: Number(env('MTN_HTTP_TIMEOUT_MS', '15000')),
  };
}

export function mtnProductConfig(product: MtnProduct): MtnProductConfig {
  const e = mtnEnv();
  const base =
    e === 'PRODUCTION'
      ? env('MTN_PROD_BASE_URL', 'https://proxy.momoapi.mtn.com')
      : env('MTN_SANDBOX_BASE_URL', 'https://sandbox.momodeveloper.mtn.com');
  const p = product === 'COLLECTION' ? 'COLLECTION' : 'DISBURSEMENT';
  const slug = product === 'COLLECTION' ? 'collection' : 'disbursement';
  return {
    product,
    env: e,
    baseUrl: base,
    subscriptionKey: env(`MTN_${p}_SUBSCRIPTION_KEY`),
    apiUser: env(`MTN_${p}_API_USER`),
    apiKey: env(`MTN_${p}_API_KEY`),
    tokenPath: `/${slug}/token/`,
  };
}

export function assertMtnProductCredentials(cfg: MtnProductConfig): void {
  const missing: string[] = [];
  if (!cfg.baseUrl) missing.push('baseUrl');
  if (!cfg.subscriptionKey) missing.push('subscriptionKey');
  if (!cfg.apiUser) missing.push('apiUser');
  if (!cfg.apiKey) missing.push('apiKey');
  if (missing.length > 0) {
    throw new Error(`MTN ${cfg.product} config incomplete: missing ${missing.join(', ')}`);
  }
}

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { argon2id, argon2Verify } from 'hash-wasm';
import type { OperatingMode } from '../money/types';

// Cryptographic primitives for /v1 API auth (dual-key model).
//   - API secret  -> argon2id hash (NN-7, SEC-A2)
//   - Signing key -> AES-256-GCM encrypted at rest; used for HMAC (SEC-API2/3)

const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

function encKey(): Buffer {
  const raw = (process.env.API_SIGNING_ENC_KEY ?? '').trim();
  if (raw === '') {
    throw new Error('API_SIGNING_ENC_KEY is not set');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('API_SIGNING_ENC_KEY must decode to 32 bytes (base64 of a 256-bit key)');
  }
  return key;
}

function keyId(key: Buffer): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 12);
}

export interface EncryptedSigningKey {
  ciphertext: string; // base64(iv|tag|ciphertext)
  kid: string;
}

export function encryptSigningKey(plaintext: string): EncryptedSigningKey {
  const key = encKey();
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([iv, tag, ct]).toString('base64'), kid: keyId(key) };
}

export function decryptSigningKey(payloadBase64: string): string {
  const key = encKey();
  const buf = Buffer.from(payloadBase64, 'base64');
  const iv = buf.subarray(0, GCM_IV_BYTES);
  const tag = buf.subarray(GCM_IV_BYTES, GCM_IV_BYTES + GCM_TAG_BYTES);
  const ct = buf.subarray(GCM_IV_BYTES + GCM_TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// ── API secret hashing (NN-7) ──

// argon2id (SEC-A2, NN-7). Parameters follow the OWASP minimum
// (m=19 MiB, t=2, p=1). Output is the standard PHC-format encoded string, which
// carries the salt and parameters, so verification needs no separate storage.
const ARGON2_OPTS = { parallelism: 1, iterations: 2, memorySize: 19_456, hashLength: 32 } as const;

export async function hashSecret(secret: string): Promise<string> {
  return argon2id({ password: secret, salt: randomBytes(16), outputType: 'encoded', ...ARGON2_OPTS });
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  try {
    return await argon2Verify({ password: secret, hash: stored });
  } catch {
    return false; // malformed hash / unsupported format
  }
}

// ── HMAC request signing (SEC-API2) ──

/** Canonical string that both client and server sign. */
export function canonicalRequest(params: {
  timestamp: string;
  method: string;
  path: string; // originalUrl (path + query)
  rawBody: string;
}): string {
  return `${params.timestamp}.${params.method.toUpperCase()}.${params.path}.${params.rawBody}`;
}

export function signRequest(signingKey: string, message: string): string {
  return createHmac('sha256', signingKey).update(message).digest('hex');
}

export function signaturesMatch(expectedHex: string, providedHex: string): boolean {
  const a = Buffer.from(expectedHex, 'hex');
  const b = Buffer.from(providedHex, 'hex');
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

// ── Generators ──

export function generateApiKey(environment: 'SANDBOX' | 'LIVE'): string {
  const prefix = environment === 'LIVE' ? 'ic_live' : 'ic_sand';
  return `${prefix}_${randomBytes(18).toString('hex')}`;
}

export function generateSecret(): string {
  return `sk_${randomBytes(24).toString('base64url')}`;
}

export function generateSigningKey(): string {
  return randomBytes(32).toString('base64');
}

/** Secret used to sign outgoing webhooks (WH-2). Set when an account is provisioned. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}

/** Map a credential environment to the transaction operating mode (SEC-API5). */
export function environmentToMode(environment: 'SANDBOX' | 'LIVE'): OperatingMode {
  return environment === 'LIVE' ? 'PRODUCTION' : 'SANDBOX';
}

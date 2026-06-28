import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { InvalidSignatureError, IpNotWhitelistedError } from '../money/errors';
import {
  canonicalRequest,
  decryptSigningKey,
  encryptSigningKey,
  generateApiKey,
  generateSecret,
  generateSigningKey,
  hashSecret,
  signRequest,
  signaturesMatch,
} from './crypto';

const REPLAY_WINDOW_SECONDS = Number(process.env.API_REPLAY_WINDOW_SECONDS ?? 300); // SEC-API3

export interface GeneratedCredential {
  id: string;
  apiKey: string;
  secret: string; // shown once (NN-7)
  signingKey: string; // shown once
}

export interface CredentialContext {
  credentialId: string;
  accountId: string;
  environment: 'SANDBOX' | 'LIVE';
}

export interface SignedRequest {
  apiKey: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  method: string;
  path: string;
  rawBody: string;
  clientIp: string | null;
}

interface CredentialRow {
  id: string;
  account_id: string;
  environment: 'SANDBOX' | 'LIVE';
  status: string;
  signing_key_ciphertext: string | null;
}
interface WhitelistRow {
  ip_whitelist: string[];
}

/**
 * Issues API credentials and authenticates inbound /v1 requests (dual-key model:
 * hashed API secret per NN-7 + AES-GCM-encrypted signing key for HMAC, SEC-API2/3).
 */
@Injectable()
export class CredentialService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Generate a credential pair for an account (used by onboarding, ONB-4/5).
   *  Pass an `executor` (a transaction client) to enrol it atomically with the
   *  account it belongs to. */
  async generate(
    input: { accountId: string; environment: 'SANDBOX' | 'LIVE' },
    executor: Pool | PoolClient = this.pool,
  ): Promise<GeneratedCredential> {
    const apiKey = generateApiKey(input.environment);
    const secret = generateSecret();
    const signingKey = generateSigningKey();
    const secretHash = await hashSecret(secret);
    const encrypted = encryptSigningKey(signingKey);

    const inserted = await executor.query<{ id: string }>(
      `INSERT INTO api_credentials
         (account_id, environment, api_key, secret_hash, signing_key_ciphertext, signing_key_kid, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
       RETURNING id`,
      [input.accountId, input.environment, apiKey, secretHash, encrypted.ciphertext, encrypted.kid],
    );

    // Plaintext secret + signing key are returned ONCE and never stored in clear.
    return { id: inserted.rows[0].id, apiKey, secret, signingKey };
  }

  /**
   * Verify a signed request (SEC-API2/3/4). Throws InvalidSignatureError on any
   * lookup/timestamp/signature failure (no detail leak), or IpNotWhitelistedError
   * for a live key from a non-whitelisted source. Returns the credential context.
   */
  async authenticate(req: SignedRequest): Promise<CredentialContext> {
    if (!req.apiKey || !req.timestamp || !req.signature) {
      throw new InvalidSignatureError();
    }

    const found = await this.pool.query<CredentialRow>(
      `SELECT id, account_id, environment, status, signing_key_ciphertext
         FROM api_credentials WHERE api_key = $1`,
      [req.apiKey],
    );
    if (found.rowCount === 0) throw new InvalidSignatureError();
    const credential = found.rows[0];
    if (credential.status !== 'ACTIVE' || credential.signing_key_ciphertext === null) {
      throw new InvalidSignatureError(); // revoked keys rejected immediately (SEC-API7)
    }

    // Timestamp window / replay protection (SEC-API3).
    const ts = Number(req.timestamp);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > REPLAY_WINDOW_SECONDS) {
      throw new InvalidSignatureError();
    }

    // Recompute the HMAC with the decrypted signing key and compare in constant time.
    const signingKey = decryptSigningKey(credential.signing_key_ciphertext);
    const expected = signRequest(
      signingKey,
      canonicalRequest({
        timestamp: req.timestamp,
        method: req.method,
        path: req.path,
        rawBody: req.rawBody,
      }),
    );
    if (!signaturesMatch(expected, req.signature)) {
      throw new InvalidSignatureError();
    }

    // Live keys honour the per-account IP whitelist (SEC-API4).
    if (credential.environment === 'LIVE') {
      const settings = await this.pool.query<WhitelistRow>(
        'SELECT ip_whitelist FROM account_settings WHERE account_id = $1',
        [credential.account_id],
      );
      const whitelist = settings.rowCount === 0 ? [] : settings.rows[0].ip_whitelist;
      if (whitelist.length > 0 && (req.clientIp === null || !whitelist.includes(req.clientIp))) {
        throw new IpNotWhitelistedError();
      }
    }

    return {
      credentialId: credential.id,
      accountId: credential.account_id,
      environment: credential.environment,
    };
  }
}

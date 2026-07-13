import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { withTransaction } from '../database/tx';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { hashSecret, verifySecret } from '../credentials/crypto';
import { signJwt } from './jwt';
import { ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS, type Realm } from './cookies';
import { realmToScope } from './realm';
import { UnauthorizedError } from '../money/errors';
import type { ActorScope } from '../money/types';

const MAX_FAILED_LOGINS = Number(process.env.AUTH_MAX_FAILED ?? 5); // SEC-A5
const LOCK_SECONDS = Number(process.env.AUTH_LOCK_SECONDS ?? 900);
const OTP_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS ?? 300); // ≤5m (SEC-A1)
const RESET_TTL_SECONDS = Number(process.env.RESET_TTL_SECONDS ?? 900); // 15m for password reset
const OTP_MAX_ATTEMPTS = Number(process.env.AUTH_OTP_MAX_ATTEMPTS ?? 5);
const LOCK_MAX_SECONDS = Number(process.env.AUTH_LOCK_MAX_SECONDS ?? 86_400); // cap backoff at 24h

// Exponential backoff (SEC-A5): each failed attempt past the threshold doubles
// the lock window, capped at LOCK_MAX_SECONDS. failed=MAX -> LOCK_SECONDS,
// failed=MAX+1 -> 2×, MAX+2 -> 4×, …
function lockDurationSeconds(failedCount: number): number {
  const over = Math.max(0, failedCount - MAX_FAILED_LOGINS);
  const seconds = LOCK_SECONDS * 2 ** Math.min(over, 20);
  return Math.min(seconds, LOCK_MAX_SECONDS);
}
const EXPOSE_OTP = process.env.AUTH_EXPOSE_OTP === 'true'; // dev/test only

// Lazily-computed dummy hash so a missing user costs ~the same as a present one
// (timing). argon2 hashing is async, so it can't be a top-level constant.
let dummyHash: string | null = null;
async function getDummyHash(): Promise<string> {
  if (dummyHash === null) {
    dummyHash = await hashSecret(randomBytes(8).toString('hex'));
  }
  return dummyHash;
}

function accessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is not set');
  return secret;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface LoginResult {
  challengeId: string;
  devCode?: string; // only when AUTH_EXPOSE_OTP=true
}
export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}
export interface VerifyResult extends SessionTokens {
  user: { id: string; email: string; scope: ActorScope; roles: string[] };
}

interface UserRow {
  id: string;
  email: string;
  scope: ActorScope;
  merchant_id: string | null;
  status: string;
  password_hash: string | null;
  failed_login_count: number;
  locked_until: Date | null;
}
interface ChallengeRow {
  user_id: string;
  code_hash: string;
  attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
}
interface SessionRow {
  id: string;
  user_id: string;
  scope: ActorScope;
  revoked_at: Date | null;
  expires_at: Date;
}

/**
 * Portal authentication (§7.1): password login → email OTP → rotating JWT
 * sessions, with lockout (SEC-A5) and realm separation (SEC-A4).
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  /** Step 1 (SEC-A1): verify password, then issue an email OTP challenge. */
  async login(input: { realm: Realm; email: string; password: string; ip?: string | null }): Promise<LoginResult> {
    const scope = realmToScope(input.realm);
    const found = await this.pool.query<UserRow>(
      `SELECT id, email, scope, merchant_id, status, password_hash, failed_login_count, locked_until
         FROM users WHERE scope = $1 AND email = $2`,
      [scope, input.email],
    );
    const user = found.rowCount === 0 ? null : found.rows[0];

    if (!user || user.status === 'DISABLED' || user.password_hash === null) {
      await verifySecret(input.password, await getDummyHash()); // equalise timing
      throw new UnauthorizedError('invalid credentials');
    }
    if (user.locked_until && user.locked_until.getTime() > Date.now()) {
      throw new UnauthorizedError('account temporarily locked');
    }

    if (!(await verifySecret(input.password, user.password_hash))) {
      const failed = user.failed_login_count + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      const lockSeconds = lock ? lockDurationSeconds(failed) : 0;
      const lockedUntil = lock ? new Date(Date.now() + lockSeconds * 1000) : null;
      await withTransaction(this.pool, async (client) => {
        await client.query(
          'UPDATE users SET failed_login_count = $1, locked_until = $2 WHERE id = $3',
          [failed, lockedUntil, user.id],
        );
        // Emit an alertable event on each lock (SEC-A5) so repeated attacks are visible.
        if (lock) {
          await this.audit.write(client, {
            actorId: user.id,
            actorScope: user.scope,
            action: 'ACCOUNT_LOCKED',
            target: user.id,
            ipAddress: input.ip ?? null,
            metadata: { failedLoginCount: failed, lockSeconds },
          });
        }
      });
      throw new UnauthorizedError('invalid credentials');
    }

    await this.pool.query(
      'UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1',
      [user.id],
    );

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = await hashSecret(code);
    const created = await this.pool.query<{ id: string }>(
      `INSERT INTO otp_challenges (user_id, code_hash, expires_at)
       VALUES ($1, $2, now() + ($3 || ' seconds')::interval) RETURNING id`,
      [user.id, codeHash, OTP_TTL_SECONDS],
    );
    await this.email.sendOtp({ to: user.email, code });

    return EXPOSE_OTP ? { challengeId: created.rows[0].id, devCode: code } : { challengeId: created.rows[0].id };
  }

  /** Reset step 1: email a reset code. Never reveals whether the email exists (SEC-A1). */
  async forgotPassword(input: { realm: Realm; email: string }): Promise<LoginResult> {
    const scope = realmToScope(input.realm);
    const found = await this.pool.query<{ id: string; email: string; status: string }>(
      'SELECT id, email, status FROM users WHERE scope = $1 AND email = $2',
      [scope, input.email],
    );
    const user = found.rowCount === 0 ? null : found.rows[0];
    if (!user || user.status === 'DISABLED') {
      // Return a non-matching challenge id so responses don't leak account existence.
      return { challengeId: randomUUID() };
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = await hashSecret(code);
    const created = await this.pool.query<{ id: string }>(
      `INSERT INTO otp_challenges (user_id, purpose, code_hash, expires_at)
       VALUES ($1, 'PASSWORD_RESET', $2, now() + ($3 || ' seconds')::interval) RETURNING id`,
      [user.id, codeHash, RESET_TTL_SECONDS],
    );
    await this.email.sendPasswordReset({ to: user.email, code });
    return EXPOSE_OTP ? { challengeId: created.rows[0].id, devCode: code } : { challengeId: created.rows[0].id };
  }

  /** Reset step 2: validate the code, set the new password, and revoke all sessions (SEC-A3/A5). */
  async resetPassword(input: {
    realm: Realm;
    challengeId: string;
    code: string;
    newPassword: string;
  }): Promise<{ ok: true }> {
    const scope = realmToScope(input.realm);
    return withTransaction(this.pool, async (client) => {
      const found = await client.query<ChallengeRow & { purpose: string }>(
        `SELECT user_id, code_hash, attempts, expires_at, consumed_at, purpose
           FROM otp_challenges WHERE id = $1 FOR UPDATE`,
        [input.challengeId],
      );
      const challenge = found.rowCount === 0 ? null : found.rows[0];
      if (
        !challenge ||
        challenge.purpose !== 'PASSWORD_RESET' ||
        challenge.consumed_at !== null ||
        challenge.expires_at.getTime() < Date.now() ||
        challenge.attempts >= OTP_MAX_ATTEMPTS
      ) {
        throw new UnauthorizedError('invalid or expired code');
      }
      if (!(await verifySecret(input.code, challenge.code_hash))) {
        await client.query('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1', [
          input.challengeId,
        ]);
        throw new UnauthorizedError('invalid or expired code');
      }
      const userRes = await client.query<{ id: string; scope: ActorScope }>(
        'SELECT id, scope FROM users WHERE id = $1',
        [challenge.user_id],
      );
      if (userRes.rowCount === 0 || userRes.rows[0].scope !== scope) {
        throw new UnauthorizedError('invalid or expired code');
      }

      await client.query('UPDATE otp_challenges SET consumed_at = now() WHERE id = $1', [
        input.challengeId,
      ]);
      const passwordHash = await hashSecret(input.newPassword);
      await client.query(
        "UPDATE users SET password_hash = $1, status = 'ACTIVE', failed_login_count = 0, locked_until = NULL WHERE id = $2",
        [passwordHash, challenge.user_id],
      );
      // Force re-login everywhere with the new password.
      await client.query(
        'UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [challenge.user_id],
      );
      await this.audit.write(client, {
        actorId: challenge.user_id,
        actorScope: scope,
        action: 'PASSWORD_RESET',
        target: challenge.user_id,
        metadata: {},
      });
      return { ok: true as const };
    });
  }

  /** Step 2 (SEC-A1/A3): validate the OTP and issue access + refresh tokens. */
  async verifyOtp(input: {
    realm: Realm;
    challengeId: string;
    code: string;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<VerifyResult> {
    return withTransaction(this.pool, async (client) => {
      const found = await client.query<ChallengeRow>(
        `SELECT user_id, code_hash, attempts, expires_at, consumed_at
           FROM otp_challenges WHERE id = $1 FOR UPDATE`,
        [input.challengeId],
      );
      const challenge = found.rowCount === 0 ? null : found.rows[0];
      if (
        !challenge ||
        challenge.consumed_at !== null ||
        challenge.expires_at.getTime() < Date.now() ||
        challenge.attempts >= OTP_MAX_ATTEMPTS
      ) {
        throw new UnauthorizedError('invalid or expired code');
      }
      if (!(await verifySecret(input.code, challenge.code_hash))) {
        await client.query('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1', [
          input.challengeId,
        ]);
        throw new UnauthorizedError('invalid or expired code');
      }
      await client.query('UPDATE otp_challenges SET consumed_at = now() WHERE id = $1', [
        input.challengeId,
      ]);

      const userRes = await client.query<UserRow>(
        `SELECT id, email, scope, merchant_id, status, password_hash, failed_login_count, locked_until
           FROM users WHERE id = $1`,
        [challenge.user_id],
      );
      const user = userRes.rows[0];
      if (user.scope !== realmToScope(input.realm)) {
        throw new UnauthorizedError('realm mismatch'); // SEC-A4
      }
      await client.query(
        "UPDATE users SET status = 'ACTIVE', last_login_at = now() WHERE id = $1",
        [user.id],
      );

      const roles = await this.loadRoles(client, user.id);
      const tokens = await this.issueSession(client, {
        userId: user.id,
        scope: user.scope,
        merchantId: user.merchant_id,
        roles,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      });
      await this.audit.write(client, {
        actorId: user.id,
        actorScope: user.scope,
        action: 'LOGIN',
        target: user.id,
        ipAddress: input.ip ?? null,
      });

      return {
        ...tokens,
        user: { id: user.id, email: user.email, scope: user.scope, roles },
      };
    });
  }

  /** Rotate the refresh token (SEC-A3). Reuse of a revoked token kills the chain. */
  async refresh(input: {
    realm: Realm;
    refreshToken: string;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<SessionTokens> {
    const scope = realmToScope(input.realm);
    return withTransaction(this.pool, async (client) => {
      const found = await client.query<SessionRow>(
        'SELECT id, user_id, scope, revoked_at, expires_at FROM auth_sessions WHERE refresh_token_hash = $1 FOR UPDATE',
        [sha256(input.refreshToken)],
      );
      const session = found.rowCount === 0 ? null : found.rows[0];
      if (!session || session.scope !== scope || session.expires_at.getTime() < Date.now()) {
        throw new UnauthorizedError('invalid session');
      }
      if (session.revoked_at !== null) {
        // Token reuse — revoke every live session for the user (theft response).
        await client.query(
          'UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
          [session.user_id],
        );
        throw new UnauthorizedError('session reuse detected');
      }

      await client.query('UPDATE auth_sessions SET revoked_at = now() WHERE id = $1', [session.id]);

      const userRes = await client.query<UserRow>(
        'SELECT id, email, scope, merchant_id, status, password_hash, failed_login_count, locked_until FROM users WHERE id = $1',
        [session.user_id],
      );
      const user = userRes.rows[0];
      if (user.status === 'DISABLED') throw new UnauthorizedError('account disabled');
      const roles = await this.loadRoles(client, user.id);

      return this.issueSession(client, {
        userId: user.id,
        scope: user.scope,
        merchantId: user.merchant_id,
        roles,
        rotatedFrom: session.id,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      });
    });
  }

  /** Invalidate a refresh token server-side (SEC-A6). */
  async logout(input: { refreshToken: string }): Promise<void> {
    await this.pool.query(
      'UPDATE auth_sessions SET revoked_at = now() WHERE refresh_token_hash = $1 AND revoked_at IS NULL',
      [sha256(input.refreshToken)],
    );
  }

  /** Set a user's password and activate them (invite acceptance / admin creation). */
  async setPassword(userId: string, password: string): Promise<void> {
    const passwordHash = await hashSecret(password);
    await this.pool.query(
      "UPDATE users SET password_hash = $1, status = 'ACTIVE', failed_login_count = 0, locked_until = NULL WHERE id = $2",
      [passwordHash, userId],
    );
  }

  private async loadRoles(client: PoolClient, userId: string): Promise<string[]> {
    const res = await client.query<{ name: string }>(
      `SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
      [userId],
    );
    return res.rows.map((row) => row.name);
  }

  private async issueSession(
    client: PoolClient,
    input: {
      userId: string;
      scope: ActorScope;
      merchantId: string | null;
      roles: string[];
      rotatedFrom?: string;
      ip: string | null;
      userAgent: string | null;
    },
  ): Promise<SessionTokens> {
    const accessToken = signJwt(
      { sub: input.userId, scope: input.scope, merchantId: input.merchantId, roles: input.roles },
      accessSecret(),
      ACCESS_TTL_SECONDS,
    );
    const refreshToken = randomBytes(32).toString('base64url');
    await client.query(
      `INSERT INTO auth_sessions
         (user_id, scope, refresh_token_hash, rotated_from, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() + ($7 || ' seconds')::interval)`,
      [
        input.userId,
        input.scope,
        sha256(refreshToken),
        input.rotatedFrom ?? null,
        input.ip,
        input.userAgent,
        REFRESH_TTL_SECONDS,
      ],
    );
    return { accessToken, refreshToken };
  }
}

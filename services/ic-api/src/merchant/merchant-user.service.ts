import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { withTransaction, isUniqueViolation } from '../database/tx';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { hashSecret } from '../credentials/crypto';
import { ConflictError, NotFoundError, ValidationError } from '../money/errors';

// Roles a merchant admin is allowed to grant. Deliberately a closed set so a
// merchant can never escalate a sub-user into a SYSTEM role (e.g. ADMIN). The
// maker-checker split lives here: INITIATOR requests, APPROVER releases (SEC-Z4).
export const MERCHANT_ROLES = [
  'MERCHANT_ADMIN',
  'MERCHANT_INITIATOR',
  'MERCHANT_APPROVER',
  'MERCHANT_VIEWER',
] as const;
export type MerchantRole = (typeof MERCHANT_ROLES)[number];

function assertMerchantRoles(roles: string[]): void {
  const bad = roles.filter((r) => !MERCHANT_ROLES.includes(r as MerchantRole));
  if (bad.length > 0) throw new ValidationError(`not assignable by a merchant: ${bad.join(', ')}`);
}

export interface CreateMerchantUserInput {
  merchantId: string;
  actorId: string;
  name: string;
  email: string;
  phone?: string | null;
  password: string;
  roles: string[];
}

// Merchant self-service user management (§6.2). Everything is scoped to the
// caller's own merchant_id — a merchant admin can only see and touch their own
// staff (NN-6). Runs on the shared pool, so audit writes succeed like elsewhere.
@Injectable()
export class MerchantUserService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  /** Assignable roles for the portal's role picker. */
  roles(): Array<{ name: string; description: string }> {
    return [
      { name: 'MERCHANT_ADMIN', description: 'Owner. Can manage users and do everything below.' },
      { name: 'MERCHANT_INITIATOR', description: 'Initiator. Can request payouts and run collections.' },
      { name: 'MERCHANT_APPROVER', description: 'Approver. Can approve or reject payout requests.' },
      { name: 'MERCHANT_VIEWER', description: 'Read only access.' },
    ];
  }

  async list(merchantId: string): Promise<unknown[]> {
    const res = await this.pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.status, u.email_verified,
              COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.merchant_id = $1 AND u.scope = 'MERCHANT'
        GROUP BY u.id ORDER BY u.name`,
      [merchantId],
    );
    return res.rows;
  }

  async create(input: CreateMerchantUserInput): Promise<{ userId: string }> {
    const roles = dedupe(input.roles);
    if (roles.length === 0) throw new ValidationError('assign at least one role');
    assertMerchantRoles(roles);
    const passwordHash = await hashSecret(input.password);
    let userId: string;
    try {
      userId = await withTransaction(this.pool, async (client) => {
        const created = await client.query<{ id: string }>(
          `INSERT INTO users (scope, merchant_id, name, email, phone, status, password_hash)
           VALUES ('MERCHANT', $1, $2, $3, $4, 'INVITED', $5) RETURNING id`,
          [input.merchantId, input.name, input.email, input.phone ?? null, passwordHash],
        );
        const id = created.rows[0].id;
        for (const role of roles) await this.attachRole(client, id, role);
        await this.audit.write(client, {
          actorId: input.actorId,
          actorScope: 'MERCHANT',
          action: 'MERCHANT_USER_CREATED',
          target: id,
          metadata: { email: input.email, roles },
        });
        return id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('a user with this email already exists');
      throw error;
    }
    // Best-effort invite — a mail failure must not undo the created user.
    try {
      await this.email.sendPortalCredentials({
        to: input.email,
        loginEmail: input.email,
        tempPassword: input.password,
      });
    } catch {
      /* logged inside EmailService */
    }
    return { userId };
  }

  async assignRole(merchantId: string, userId: string, role: string, actorId: string): Promise<void> {
    assertMerchantRoles([role]);
    await this.ownedUser(merchantId, userId);
    await withTransaction(this.pool, async (client) => {
      await this.attachRole(client, userId, role);
      await this.audit.write(client, {
        actorId,
        actorScope: 'MERCHANT',
        action: 'MERCHANT_ROLE_ASSIGNED',
        target: userId,
        metadata: { role },
      });
    });
  }

  async removeRole(merchantId: string, userId: string, role: string, actorId: string): Promise<void> {
    // Anti-lockout: an admin cannot strip their own admin role.
    if (userId === actorId && role === 'MERCHANT_ADMIN') {
      throw new ValidationError('you cannot remove your own admin role');
    }
    await this.ownedUser(merchantId, userId);
    await withTransaction(this.pool, async (client) => {
      const res = await client.query(
        'DELETE FROM user_roles WHERE user_id = $1 AND role_id = (SELECT id FROM roles WHERE name = $2)',
        [userId, role],
      );
      if (res.rowCount === 0) throw new NotFoundError('user does not have that role');
      await this.audit.write(client, {
        actorId,
        actorScope: 'MERCHANT',
        action: 'MERCHANT_ROLE_REMOVED',
        target: userId,
        metadata: { role },
      });
    });
  }

  async setStatus(merchantId: string, userId: string, status: string, actorId: string): Promise<void> {
    if (status !== 'ACTIVE' && status !== 'DISABLED') {
      throw new ValidationError('status must be ACTIVE or DISABLED');
    }
    if (userId === actorId) throw new ValidationError('you cannot change your own status');
    await this.ownedUser(merchantId, userId);
    await withTransaction(this.pool, async (client) => {
      await client.query('UPDATE users SET status = $1 WHERE id = $2', [status, userId]);
      await this.audit.write(client, {
        actorId,
        actorScope: 'MERCHANT',
        action: status === 'DISABLED' ? 'MERCHANT_USER_DISABLED' : 'MERCHANT_USER_ACTIVATED',
        target: userId,
        metadata: {},
      });
    });
  }

  /** Verifies the target user belongs to this merchant before any mutation (NN-6). */
  private async ownedUser(merchantId: string, userId: string): Promise<void> {
    const res = await this.pool.query(
      "SELECT 1 FROM users WHERE id = $1 AND merchant_id = $2 AND scope = 'MERCHANT'",
      [userId, merchantId],
    );
    if (res.rowCount === 0) throw new NotFoundError('user not found');
  }

  private async attachRole(client: PoolClient, userId: string, role: string): Promise<void> {
    const roleRow = await client.query<{ id: string }>('SELECT id FROM roles WHERE name = $1', [role]);
    if (roleRow.rowCount === 0) throw new NotFoundError(`role not found: ${role}`);
    await client.query(
      'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT (user_id, role_id) DO NOTHING',
      [userId, roleRow.rows[0].id],
    );
  }
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

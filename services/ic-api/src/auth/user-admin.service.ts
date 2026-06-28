import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { withTransaction, isUniqueViolation } from '../database/tx';
import { AuditService } from '../audit/audit.service';
import { hashSecret } from '../credentials/crypto';
import { ConflictError, NotFoundError } from '../money/errors';
import type { ActorScope } from '../money/types';

export interface CreateUserInput {
  name: string;
  email: string;
  phone?: string | null;
  scope: ActorScope;
  merchantId?: string | null;
  role: string;
  password: string;
}

// Admin User Management (§6.1.9): system users + roles. Creating a user sets an
// initial password (they change it later); first OTP login activates them.
@Injectable()
export class UserAdminService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly audit: AuditService,
  ) {}

  async listUsers(scope: ActorScope | null): Promise<unknown[]> {
    const res = await this.pool.query(
      `SELECT u.id, u.scope, u.merchant_id, u.name, u.email, u.phone, u.status, u.email_verified,
              COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN roles r ON r.id = ur.role_id
        WHERE ($1::user_scope IS NULL OR u.scope = $1)
        GROUP BY u.id ORDER BY u.name LIMIT 200`,
      [scope],
    );
    return res.rows;
  }

  async createUser(input: CreateUserInput, actorId: string): Promise<{ userId: string }> {
    if (input.scope === 'MERCHANT' && !input.merchantId) {
      throw new ConflictError('merchantId is required for a MERCHANT-scope user');
    }
    const passwordHash = await hashSecret(input.password);
    try {
      return await withTransaction(this.pool, async (client) => {
        const created = await client.query<{ id: string }>(
          `INSERT INTO users (scope, merchant_id, name, email, phone, status, password_hash)
           VALUES ($1, $2, $3, $4, $5, 'INVITED', $6) RETURNING id`,
          [input.scope, input.scope === 'MERCHANT' ? input.merchantId : null, input.name, input.email, input.phone ?? null, passwordHash],
        );
        const userId = created.rows[0].id;
        await this.attachRole(client, userId, input.role);
        await this.audit.write(client, {
          actorId,
          actorScope: 'SYSTEM',
          action: 'USER_CREATED',
          target: userId,
          metadata: { email: input.email, scope: input.scope, role: input.role },
        });
        return { userId };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('a user with this email already exists');
      throw error;
    }
  }

  async assignRole(userId: string, role: string, actorId: string): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await this.attachRole(client, userId, role);
      await this.audit.write(client, {
        actorId,
        actorScope: 'SYSTEM',
        action: 'ROLE_ASSIGNED',
        target: userId,
        metadata: { role },
      });
    });
  }

  async removeRole(userId: string, role: string, actorId: string): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      const res = await client.query(
        'DELETE FROM user_roles WHERE user_id = $1 AND role_id = (SELECT id FROM roles WHERE name = $2)',
        [userId, role],
      );
      if (res.rowCount === 0) throw new NotFoundError('user does not have that role');
      await this.audit.write(client, {
        actorId,
        actorScope: 'SYSTEM',
        action: 'ROLE_REMOVED',
        target: userId,
        metadata: { role },
      });
    });
  }

  async listRoles(): Promise<unknown[]> {
    const res = await this.pool.query(
      'SELECT name, description, is_custom FROM roles ORDER BY is_custom, name',
    );
    return res.rows;
  }

  async createRole(name: string, description: string | null, actorId: string): Promise<{ name: string }> {
    const res = await this.pool.query<{ id: string }>(
      "INSERT INTO roles (name, description, is_custom) VALUES ($1, $2, true) ON CONFLICT (name) DO NOTHING RETURNING id",
      [name, description],
    );
    if (res.rowCount === 0) throw new ConflictError(`role already exists: ${name}`);
    const client = await this.pool.connect();
    try {
      await this.audit.write(client, {
        actorId,
        actorScope: 'SYSTEM',
        action: 'ROLE_CREATED',
        target: name,
        metadata: { description },
      });
    } finally {
      client.release();
    }
    return { name };
  }

  private async attachRole(client: PoolClient, userId: string, role: string): Promise<void> {
    const roleRow = await client.query<{ id: string }>('SELECT id FROM roles WHERE name = $1', [role]);
    if (roleRow.rowCount === 0) throw new NotFoundError(`role not found: ${role}`);
    const user = await client.query('SELECT 1 FROM users WHERE id = $1', [userId]);
    if (user.rowCount === 0) throw new NotFoundError(`user not found: ${userId}`);
    await client.query(
      'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT (user_id, role_id) DO NOTHING',
      [userId, roleRow.rows[0].id],
    );
  }
}

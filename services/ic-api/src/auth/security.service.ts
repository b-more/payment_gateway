import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { NotFoundError } from '../money/errors';

// Security module (§6.1.6 → §7.6): read the append-only audit trail (SEC-AU1/2)
// and manage active sessions (SEC-A3/A6).
@Injectable()
export class SecurityService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly audit: AuditService,
  ) {}

  async listAuditLogs(filter: { action?: string | null }): Promise<unknown[]> {
    const res = await this.pool.query(
      `SELECT id, actor_id, actor_scope, action, target, ip_address, metadata,
              to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
         FROM audit_logs
        WHERE ($1::text IS NULL OR action = $1)
        ORDER BY created_at DESC LIMIT 200`,
      [filter.action ?? null],
    );
    return res.rows;
  }

  async listSessions(): Promise<unknown[]> {
    const res = await this.pool.query(
      `SELECT s.id, s.user_id, u.email, u.name, s.scope, s.ip_address, s.user_agent,
              to_char(s.created_at, 'YYYY-MM-DD HH24:MI') AS created_at,
              to_char(s.expires_at, 'YYYY-MM-DD HH24:MI') AS expires_at
         FROM auth_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.revoked_at IS NULL AND s.expires_at > now()
        ORDER BY s.created_at DESC LIMIT 200`,
    );
    return res.rows;
  }

  async revokeSession(sessionId: string, actorId: string): Promise<void> {
    const res = await this.pool.query(
      'UPDATE auth_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL',
      [sessionId],
    );
    if (res.rowCount === 0) throw new NotFoundError('session not found or already revoked');
    await this.writeAudit(actorId, 'SESSION_REVOKED', sessionId, {});
  }

  async revokeUserSessions(userId: string, actorId: string): Promise<{ revoked: number }> {
    const res = await this.pool.query(
      'UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    );
    await this.writeAudit(actorId, 'SESSIONS_REVOKED_ALL', userId, { revoked: res.rowCount ?? 0 });
    return { revoked: res.rowCount ?? 0 };
  }

  private async writeAudit(
    actorId: string,
    action: string,
    target: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await this.audit.write(client, { actorId, actorScope: 'SYSTEM', action, target, metadata });
    } finally {
      client.release();
    }
  }
}

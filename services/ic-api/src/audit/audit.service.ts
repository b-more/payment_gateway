import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { ActorScope } from '../money/types';

export interface AuditEntry {
  actorId?: string | null;
  actorScope?: ActorScope | null;
  action: string; // e.g. FLOAT_CREDIT, TRANSACTION_REVERSED (SEC-AU1)
  target?: string | null;
  metadata?: unknown; // before/after where relevant (SEC-AU2)
  ipAddress?: string | null;
}

/**
 * Append-only audit writer (NN-9, SEC-AU1/2). Writes within the caller's
 * transaction so the audit row commits atomically with the action it records.
 */
@Injectable()
export class AuditService {
  async write(client: PoolClient, entry: AuditEntry): Promise<void> {
    await client.query(
      `INSERT INTO audit_logs (actor_id, actor_scope, action, target, metadata, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.actorId ?? null,
        entry.actorScope ?? null,
        entry.action,
        entry.target ?? null,
        entry.metadata === undefined || entry.metadata === null
          ? null
          : JSON.stringify(entry.metadata),
        entry.ipAddress ?? null,
      ],
    );
  }
}

import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { withTransaction } from '../database/tx';
import { assertAttemptTransition, isFinalAttemptState, type AttemptState } from './mtn-attempt';
import type {
  MtnAttempt,
  MtnAttemptStore,
  CreateAttemptInput,
  TransitionPatch,
} from './mtn-attempts.store';

interface AttemptRow {
  id: string;
  transaction_id: string | null;
  direction: 'COLLECTION' | 'DISBURSEMENT';
  mtn_env: string;
  msisdn: string | null;
  amount_ngwee: string | null;
  mtn_ref_id: string;
  external_id: string | null;
  attempt_no: number;
  state: AttemptState;
  financial_transaction_id: string | null;
  reason: string | null;
}

function mapRow(r: AttemptRow): MtnAttempt {
  return {
    id: r.id,
    transactionId: r.transaction_id,
    direction: r.direction,
    mtnEnv: r.mtn_env,
    msisdn: r.msisdn,
    amountNgwee: r.amount_ngwee === null ? null : BigInt(r.amount_ngwee),
    mtnRefId: r.mtn_ref_id,
    externalId: r.external_id,
    attemptNo: r.attempt_no,
    state: r.state,
    financialTransactionId: r.financial_transaction_id,
    reason: r.reason,
  };
}

@Injectable()
export class MtnAttemptsRepository implements MtnAttemptStore {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(input: CreateAttemptInput): Promise<MtnAttempt> {
    return withTransaction(this.pool, async (client) => {
      const res = await client.query<AttemptRow>(
        `INSERT INTO mtn_attempts
           (transaction_id, direction, mtn_env, msisdn, amount_ngwee, mtn_ref_id, external_id, attempt_no)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          input.transactionId,
          input.direction,
          input.mtnEnv,
          input.msisdn,
          input.amountNgwee === null ? null : input.amountNgwee.toString(),
          input.mtnRefId,
          input.externalId,
          input.attemptNo,
        ],
      );
      await client.query(
        `INSERT INTO mtn_attempt_events (attempt_id, from_state, to_state, source, detail)
         VALUES ($1, NULL, 'CREATED', 'API', '{}'::jsonb)`,
        [res.rows[0].id],
      );
      return mapRow(res.rows[0]);
    });
  }

  async transition(attemptId: string, patch: TransitionPatch): Promise<MtnAttempt> {
    return withTransaction(this.pool, async (client) => {
      const cur = await client.query<{ state: AttemptState }>(
        'SELECT state FROM mtn_attempts WHERE id = $1 FOR UPDATE',
        [attemptId],
      );
      if (cur.rowCount === 0) throw new Error(`mtn attempt not found: ${attemptId}`);
      const from = cur.rows[0].state;
      assertAttemptTransition(from, patch.to);
      const final = isFinalAttemptState(patch.to);

      const res = await client.query<AttemptRow>(
        `UPDATE mtn_attempts SET
           state = $2,
           financial_transaction_id = COALESCE($3, financial_transaction_id),
           reason = COALESCE($4, reason),
           updated_at = now(),
           resolved_at = CASE WHEN $5 THEN now() ELSE resolved_at END
         WHERE id = $1 RETURNING *`,
        [attemptId, patch.to, patch.financialTransactionId ?? null, patch.reason ?? null, final],
      );
      await client.query(
        `INSERT INTO mtn_attempt_events (attempt_id, from_state, to_state, source, detail)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [attemptId, from, patch.to, patch.source, JSON.stringify(patch.detail ?? {})],
      );
      return mapRow(res.rows[0]);
    });
  }

  async findByRefId(mtnRefId: string): Promise<MtnAttempt | null> {
    const res = await this.pool.query<AttemptRow>('SELECT * FROM mtn_attempts WHERE mtn_ref_id = $1', [
      mtnRefId,
    ]);
    return res.rowCount === 0 ? null : mapRow(res.rows[0]);
  }

  async findLatestByTransactionId(transactionId: string): Promise<MtnAttempt | null> {
    const res = await this.pool.query<AttemptRow>(
      'SELECT * FROM mtn_attempts WHERE transaction_id = $1 ORDER BY attempt_no DESC LIMIT 1',
      [transactionId],
    );
    return res.rowCount === 0 ? null : mapRow(res.rows[0]);
  }

  async latestAttemptNo(transactionId: string): Promise<number> {
    const res = await this.pool.query<{ n: string }>(
      'SELECT COALESCE(MAX(attempt_no), 0)::text AS n FROM mtn_attempts WHERE transaction_id = $1',
      [transactionId],
    );
    return Number(res.rows[0].n);
  }

  async listUnresolved(olderThanSeconds = 0): Promise<MtnAttempt[]> {
    const res = await this.pool.query<AttemptRow>(
      `SELECT * FROM mtn_attempts
        WHERE state IN ('INITIATED','PENDING','UNKNOWN')
          AND updated_at < now() - ($1 || ' seconds')::interval
        ORDER BY created_at`,
      [olderThanSeconds],
    );
    return res.rows.map(mapRow);
  }
}

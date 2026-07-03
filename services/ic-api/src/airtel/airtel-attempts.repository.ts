import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { withTransaction } from '../database/tx';
import { assertAttemptTransition, isFinalAttemptState, type AttemptState } from './airtel-attempt';
import type {
  AirtelAttempt,
  AirtelAttemptStore,
  CreateAttemptInput,
  TransitionPatch,
} from './airtel-attempts.store';

interface AttemptRow {
  id: string;
  transaction_id: string | null;
  direction: 'COLLECTION' | 'DISBURSEMENT';
  airtel_env: string;
  msisdn: string | null;
  amount_ngwee: string | null;
  airtel_txn_id: string;
  attempt_no: number;
  state: AttemptState;
  airtel_money_id: string | null;
  result_code: string | null;
  request_id: string | null;
  failure_reason: string | null;
}

function mapRow(r: AttemptRow): AirtelAttempt {
  return {
    id: r.id,
    transactionId: r.transaction_id,
    direction: r.direction,
    airtelEnv: r.airtel_env,
    msisdn: r.msisdn,
    amountNgwee: r.amount_ngwee === null ? null : BigInt(r.amount_ngwee),
    airtelTxnId: r.airtel_txn_id,
    attemptNo: r.attempt_no,
    state: r.state,
    airtelMoneyId: r.airtel_money_id,
    resultCode: r.result_code,
    requestId: r.request_id,
    failureReason: r.failure_reason,
  };
}

@Injectable()
export class AirtelAttemptsRepository implements AirtelAttemptStore {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(input: CreateAttemptInput): Promise<AirtelAttempt> {
    return withTransaction(this.pool, async (client) => {
      const res = await client.query<AttemptRow>(
        `INSERT INTO airtel_attempts
           (transaction_id, direction, airtel_env, msisdn, amount_ngwee, airtel_txn_id, attempt_no)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          input.transactionId,
          input.direction,
          input.airtelEnv,
          input.msisdn,
          input.amountNgwee === null ? null : input.amountNgwee.toString(),
          input.airtelTxnId,
          input.attemptNo,
        ],
      );
      await client.query(
        `INSERT INTO airtel_attempt_events (attempt_id, from_state, to_state, source, detail)
         VALUES ($1, NULL, 'CREATED', 'API', '{}'::jsonb)`,
        [res.rows[0].id],
      );
      return mapRow(res.rows[0]);
    });
  }

  async transition(attemptId: string, patch: TransitionPatch): Promise<AirtelAttempt> {
    return withTransaction(this.pool, async (client) => {
      const cur = await client.query<{ state: AttemptState }>(
        'SELECT state FROM airtel_attempts WHERE id = $1 FOR UPDATE',
        [attemptId],
      );
      if (cur.rowCount === 0) throw new Error(`airtel attempt not found: ${attemptId}`);
      const from = cur.rows[0].state;
      assertAttemptTransition(from, patch.to); // defensive: repo enforces the state machine too
      const final = isFinalAttemptState(patch.to);

      const res = await client.query<AttemptRow>(
        `UPDATE airtel_attempts SET
           state          = $2,
           airtel_money_id = COALESCE($3, airtel_money_id),
           result_code    = COALESCE($4, result_code),
           request_id     = COALESCE($5, request_id),
           failure_reason = COALESCE($6, failure_reason),
           updated_at     = now(),
           resolved_at    = CASE WHEN $7 THEN now() ELSE resolved_at END
         WHERE id = $1
         RETURNING *`,
        [
          attemptId,
          patch.to,
          patch.airtelMoneyId ?? null,
          patch.resultCode ?? null,
          patch.requestId ?? null,
          patch.failureReason ?? null,
          final,
        ],
      );
      await client.query(
        `INSERT INTO airtel_attempt_events (attempt_id, from_state, to_state, source, detail)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [attemptId, from, patch.to, patch.source, JSON.stringify(patch.detail ?? {})],
      );
      return mapRow(res.rows[0]);
    });
  }

  async findByAirtelTxnId(airtelTxnId: string): Promise<AirtelAttempt | null> {
    const res = await this.pool.query<AttemptRow>(
      'SELECT * FROM airtel_attempts WHERE airtel_txn_id = $1',
      [airtelTxnId],
    );
    return res.rowCount === 0 ? null : mapRow(res.rows[0]);
  }

  /** Look up by Airtel's own reference (callbacks may carry only this). */
  async findByAirtelMoneyId(airtelMoneyId: string): Promise<AirtelAttempt | null> {
    const res = await this.pool.query<AttemptRow>(
      'SELECT * FROM airtel_attempts WHERE airtel_money_id = $1 ORDER BY created_at DESC LIMIT 1',
      [airtelMoneyId],
    );
    return res.rowCount === 0 ? null : mapRow(res.rows[0]);
  }

  /** Non-final attempts for the reconciliation job to re-enquire. */
  async listUnresolved(olderThanSeconds = 0): Promise<AirtelAttempt[]> {
    const res = await this.pool.query<AttemptRow>(
      `SELECT * FROM airtel_attempts
        WHERE state IN ('INITIATED','PENDING','UNKNOWN')
          AND updated_at < now() - ($1 || ' seconds')::interval
        ORDER BY created_at`,
      [olderThanSeconds],
    );
    return res.rows.map(mapRow);
  }

  async latestAttemptNo(transactionId: string): Promise<number> {
    const res = await this.pool.query<{ n: string }>(
      'SELECT COALESCE(MAX(attempt_no), 0)::text AS n FROM airtel_attempts WHERE transaction_id = $1',
      [transactionId],
    );
    return Number(res.rows[0].n);
  }
}

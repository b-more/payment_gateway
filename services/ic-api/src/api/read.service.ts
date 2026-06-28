import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { NotFoundError } from '../money/errors';
import type { OperatingMode } from '../money/types';

export interface BalanceResponse {
  account_id: string;
  float_balance: string;
  low_float_threshold: string;
  operating_mode: OperatingMode;
}

export interface SettlementResponse {
  id: string;
  amount: string;
  status: string;
  settled_at: string | null;
  created_at: string;
}

interface AccountRow {
  float_balance: string;
  low_float_threshold: string;
  operating_mode: OperatingMode;
}
interface SettlementRow {
  id: string;
  amount: string;
  status: string;
  settled_at: Date | null;
  created_at: Date;
}

/** Read-only projections for the account-scoped GET endpoints (§8). */
@Injectable()
export class ApiReadService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getBalance(accountId: string): Promise<BalanceResponse> {
    const result = await this.pool.query<AccountRow>(
      'SELECT float_balance, low_float_threshold, operating_mode FROM accounts WHERE id = $1',
      [accountId],
    );
    if (result.rowCount === 0) {
      throw new NotFoundError(`account not found: ${accountId}`);
    }
    const row = result.rows[0];
    return {
      account_id: accountId,
      float_balance: row.float_balance,
      low_float_threshold: row.low_float_threshold,
      operating_mode: row.operating_mode,
    };
  }

  async listSettlements(accountId: string): Promise<SettlementResponse[]> {
    const result = await this.pool.query<SettlementRow>(
      `SELECT id, amount, status, settled_at, created_at
         FROM settlements WHERE account_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [accountId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      amount: row.amount,
      status: row.status,
      settled_at: row.settled_at === null ? null : row.settled_at.toISOString(),
      created_at: row.created_at.toISOString(),
    }));
  }
}

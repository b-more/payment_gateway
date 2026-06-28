import { Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

// Dependency-injection tokens for the shared connection pool and money config.
export const PG_POOL = Symbol('PG_POOL');
export const MONEY_CONFIG = Symbol('MONEY_CONFIG');

@Injectable()
class PoolCleanup implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}
  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

export interface MoneyConfig {
  // Float credits strictly above this (ngwee) require a second approver (FLOAT-3).
  // Unset/0 means EVERY credit requires dual approval (fail safe).
  dualControlThreshold: bigint;
}

export function createPool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  return new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 10),
  });
}

function readDualControlThreshold(): bigint {
  const raw = (process.env.DUAL_CONTROL_THRESHOLD ?? '').trim();
  if (raw === '') return 0n; // fail safe: everything needs dual control
  if (!/^\d+$/.test(raw)) {
    throw new Error('DUAL_CONTROL_THRESHOLD must be a non-negative integer (ngwee)');
  }
  return BigInt(raw);
}

@Module({
  providers: [
    { provide: PG_POOL, useFactory: () => createPool() },
    {
      provide: MONEY_CONFIG,
      useFactory: (): MoneyConfig => ({ dualControlThreshold: readDualControlThreshold() }),
    },
    PoolCleanup,
  ],
  exports: [PG_POOL, MONEY_CONFIG],
})
export class DatabaseModule {}

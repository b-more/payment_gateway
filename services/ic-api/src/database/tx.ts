import type { Pool, PoolClient } from 'pg';

/**
 * Run `fn` inside a single database transaction on a dedicated connection.
 * Commits on success, rolls back on any throw, and always releases the client.
 * Money-mutating operations use this so the row lock, ledger write, balance
 * update and audit row all commit atomically (TXN-1, FLOAT-4).
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** PostgreSQL unique_violation (used to detect idempotency-key races). */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

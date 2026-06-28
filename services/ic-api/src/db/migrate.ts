import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from 'pg';

// ─────────────────────────────────────────────────────────────────────────────
// Migration runner (DEP-4).
//
// Migrations are explicit, forward-only, and additive. This runs as a deliberate
// deploy step — NEVER on application boot. Each `.sql` file in `migrations/` is
// applied once, in lexical order, inside its own transaction, and recorded in
// `schema_migrations`. Destructive DDL (DROP/TRUNCATE/DELETE) is refused unless
// MIGRATE_ALLOW_DESTRUCTIVE=true, protecting the append-only ledger/audit tables
// (NN-2, NN-9).
// ─────────────────────────────────────────────────────────────────────────────

const MIGRATIONS_DIR = resolve(process.cwd(), 'migrations');

// A statement is destructive only when one of these is its LEADING keyword.
// Checking the leading token (not a substring) avoids false positives on
// protective definitions such as `CREATE TRIGGER ... BEFORE TRUNCATE ...`.
const DESTRUCTIVE_LEADING =
  /^(DROP\s+(TABLE|SCHEMA|DATABASE|VIEW)|TRUNCATE|DELETE\s+FROM|ALTER\s+TABLE\b[\s\S]*\bDROP\s+COLUMN)\b/i;

function hasDestructiveStatement(sql: string): boolean {
  const withoutComments = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');
  return withoutComments
    .split(';')
    .map((statement) => statement.trim())
    .some((statement) => DESTRUCTIVE_LEADING.test(statement));
}

async function migrate(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const allowDestructive = process.env.MIGRATE_ALLOW_DESTRUCTIVE === 'true';

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const result = await client.query<{ version: string }>(
      'SELECT version FROM schema_migrations',
    );
    const applied = new Set<string>(result.rows.map((row) => row.version));

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      if (!allowDestructive && hasDestructiveStatement(sql)) {
        throw new Error(
          `Refusing destructive migration "${file}". ` +
            'Set MIGRATE_ALLOW_DESTRUCTIVE=true to override (DEP-4).',
        );
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        count += 1;
        process.stdout.write(`applied ${file}\n`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    process.stdout.write(
      count === 0 ? 'no pending migrations\n' : `done: applied ${count} migration(s)\n`,
    );
  } finally {
    await client.end();
  }
}

migrate().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`migration failed: ${message}\n`);
  process.exitCode = 1;
});

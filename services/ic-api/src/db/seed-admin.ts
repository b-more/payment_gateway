import { createPool } from '../database/database.module';
import { hashSecret } from '../credentials/crypto';

// One-time bootstrap of the first SYSTEM admin (resolves the chicken-and-egg of
// User Management). Idempotent: skips if a SYSTEM user with that email exists.
//   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required');
  }

  const pool = createPool();
  try {
    const existing = await pool.query(
      "SELECT id FROM users WHERE scope = 'SYSTEM' AND email = $1",
      [email],
    );
    if ((existing.rowCount ?? 0) > 0) {
      process.stdout.write(`admin already exists: ${email}\n`);
      return;
    }
    const passwordHash = await hashSecret(password);
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (scope, name, email, status, email_verified, password_hash)
       VALUES ('SYSTEM', 'Administrator', $1, 'INVITED', true, $2) RETURNING id`,
      [email, passwordHash],
    );
    await pool.query(
      "INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = 'ADMIN'",
      [created.rows[0].id],
    );
    process.stdout.write(`seeded ADMIN user: ${email}\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`seed-admin failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

import { Client } from 'pg';

// ─────────────────────────────────────────────────────────────────────────────
// Role provisioning (SEC-D7).
//
// Sets LOGIN + per-environment password on the app DB roles created by migration
// 0003. Run as an explicit deploy step using the owner connection (DATABASE_URL),
// AFTER migrations. Passwords come from the environment so they never enter
// version control (§2.2, DEP-2). Re-runnable (idempotent): it only updates auth.
// ─────────────────────────────────────────────────────────────────────────────

const ROLES: ReadonlyArray<{ role: string; passwordEnv: string }> = [
  { role: 'ic_app_api', passwordEnv: 'IC_API_DB_PASSWORD' },
  { role: 'ic_app_admin', passwordEnv: 'IC_ADMIN_DB_PASSWORD' },
  { role: 'ic_app_merchant', passwordEnv: 'IC_MERCHANT_DB_PASSWORD' },
  // Combined runtime login role (0018) — inherits the three above. The app
  // connects as this instead of the superuser owner.
  { role: 'ic_app', passwordEnv: 'IC_APP_DB_PASSWORD' },
];

// Role names are fixed, code-controlled constants — assert the shape rather than
// escape them. Passwords are dynamic secrets and are quoted as SQL string
// literals (standard_conforming_strings is on by default in PostgreSQL).
const SAFE_ROLE = /^[a-z_][a-z0-9_]*$/;

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function provision(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    for (const { role, passwordEnv } of ROLES) {
      if (!SAFE_ROLE.test(role)) {
        throw new Error(`Unsafe role name: ${role}`);
      }
      const password = process.env[passwordEnv];
      if (!password) {
        throw new Error(`${passwordEnv} is not set (required to provision role ${role})`);
      }

      const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
      if (exists.rowCount === 0) {
        throw new Error(`Role ${role} does not exist. Run migrations first (0003).`);
      }

      await client.query(`ALTER ROLE ${role} WITH LOGIN PASSWORD ${quoteLiteral(password)}`);
      process.stdout.write(`provisioned ${role} (LOGIN, password set)\n`);
    }
  } finally {
    await client.end();
  }
}

provision().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`role provisioning failed: ${message}\n`);
  process.exitCode = 1;
});

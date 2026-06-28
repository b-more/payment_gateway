# Migrations

Forward-only SQL migrations applied by `src/db/migrate.ts` (DEP-4).

## Conventions
- One file per change: `NNNN_short_description.sql`, zero-padded, lexically ordered.
- Additive only. Corrections are new migrations, never edits to applied files.
- Append-only `float_ledger` / `audit_logs` are never altered destructively (NN-2, NN-9).
- Each file runs in its own transaction and is recorded in `schema_migrations`.

## Running
```bash
# dev (from services/ic-api)
npm run migrate

# production (after `npm run build`, or inside the image)
npm run migrate:prod
# or, as an explicit one-shot via compose (never runs on boot):
docker compose --profile tools run --rm ic-migrate
```

Destructive statements (DROP/TRUNCATE/DELETE/DROP COLUMN) are refused unless
`MIGRATE_ALLOW_DESTRUCTIVE=true` is set.

## App DB roles (SEC-D7)

`0003_app_roles_grants.sql` creates the least-privilege login roles (`ic_app_api`,
`ic_app_admin`, `ic_app_merchant`) as NOLOGIN with no password and applies their
grants. Landing gets no role (§6.3). After migrating, set their passwords:

```bash
npm run provision:roles          # dev (reads IC_*_DB_PASSWORD from env)
# or, as a one-shot via compose:
docker compose --profile tools run --rm ic-provision-roles
```

New tables in later migrations get no privileges by default — each migration must
`GRANT` explicitly to the roles that need them.

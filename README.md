# Instacompay Gateway

All-TypeScript payment gateway. This repository currently contains the **project
scaffold only** — container/service skeleton per the build spec §2 (System
Architecture) and §9 (Docker & Deployment). No feature code or business logic yet.

> Source of truth: `INSTACOMPAY_BUILD_SPEC (2).md`. Re-read the relevant section
> before implementing any feature and validate against its requirement IDs.

## Services

| Container | Stack | Internal port | Public? |
|---|---|---|---|
| `ic-nginx` | Nginx 1.27 | 80 / 443 | **Yes — the only public service** (NN-5) |
| `ic-admin` | Next.js 15 + React 19 (TS) | 8010 | No (proxied) |
| `ic-merchant` | Next.js 15 + React 19 (TS) | 8020 | No (proxied) |
| `ic-api` | NestJS 11 (Node + TS) | 8030 | No (proxied) |
| `ic-landing` | Next.js 15 (TS) | 8040 | No (proxied) |
| `ic-postgres` | PostgreSQL 16 | 5432 | No — internal network only (SEC-D5) |
| `ic-redis` | Redis 7 | 6379 | No — internal network only (SEC-D6) |

All four apps share one Postgres database (NN-4). TypeScript `strict` everywhere;
no plain JavaScript in source (§3).

## Layout

```
gateway/
├── docker-compose.yml        # full topology; two networks (ic-public, ic-internal)
├── .env.example              # env template — copy to .env (git-ignored)
├── .gitignore                # excludes .env, node_modules, certs
├── nginx/                    # edge: reverse proxy, security headers, routing
└── services/
    ├── ic-api/               # NestJS API
    ├── ic-admin/             # Admin portal
    ├── ic-merchant/          # Merchant portal
    └── ic-landing/           # Marketing site
```

## Getting started (dev)

```bash
cp .env.example .env          # then fill in real secrets — NEVER commit .env
docker compose build
docker compose up -d
```

Each app exposes a liveness endpoint used by the container healthcheck (DEP-5):
`ic-api` → `/health`; the Next.js apps → `/api/health`.

### Database migrations (DEP-4)

Migrations are an explicit, forward-only deploy step — never run on app boot.

```bash
docker compose --profile tools run --rm ic-migrate   # apply pending migrations
```

For local dev, from `services/ic-api`: `npm run migrate`. Destructive DDL is
refused unless `MIGRATE_ALLOW_DESTRUCTIVE=true`. See `services/ic-api/migrations/`.

### Money-safety lint (NN-1, SEC-M1)

`services/ic-api/eslint.config.ts` ships a custom `money/no-float-money` rule that
fails the build if a money-named field is typed `number`, or a float literal is
assigned to one. Money is integer ngwee, typed `bigint`. Run `npm run lint` in
`services/ic-api`.

### Money engine (§5)

The float/transaction core lives in `services/ic-api/src` (`money/`, `ledger/`,
`float/`, `transactions/`, `processors/`, `audit/`), wired by `MoneyModule`. It
covers: double-entry float ledger with row-locked spend (TXN-1), dual-control
float credits (FLOAT-3), integer-safe charge calc (§5.4), the transaction state
machine (§5.5), idempotency (§5.6), reversal/refund as compensating entries
(STATE-3), and a sandbox processor simulator (TXN-5).

```bash
npm run test:unit   # pure logic: charges, state machine, money helpers
npm run test:int    # full money flows against a live DB (needs DATABASE_URL)
```

### HTTP API (§8)

The `/v1` surface lives in `services/ic-api/src/api` (`ApiModule`): six endpoints
over the engine with dual-key HMAC auth (api_key + signed request, SEC-API2/3),
per-account IP whitelist (SEC-API4), rate limiting (SEC-API6), idempotency
(IDEM-1), and account-scoped reads. OpenAPI/Swagger UI at `/docs`; client samples
and the signing scheme are in `services/ic-api/docs/API.md`.

```bash
npm run test:api    # boots Nest, signs requests, hits every endpoint (needs DATABASE_URL)
```

API auth is the **dual-key** model (see `docs/API.md`): the API secret is stored
hashed (NN-7); a separate per-credential signing key is stored AES-GCM-encrypted
and used to verify HMAC request signatures. Set `API_SIGNING_ENC_KEY` (32 bytes,
base64) in `.env`.

## Network model

- `ic-public` — Nginx + the four apps. Carries public traffic (via Nginx) and egress.
- `ic-internal` — `internal: true`. Postgres + Redis live here with **no host port
  mapping and no internet route**, so they are never publicly reachable (NN-5).
- App ports are mapped to `127.0.0.1` only (loopback), for local debugging — not
  exposed on the public interface. Production traffic arrives on 443 → Nginx.

## Not yet built (intentionally deferred)

The §12 validation gate / production cutover. In place: data model (§4), money
engine core (§5.2–5.6), merchant onboarding + auto-credentials (§5.1), signed
webhook delivery with Redis retry queue (§5.7), settlement (§5.8) and
reconciliation (§5.9) jobs, the §8 `/v1` HTTP API with HMAC auth + OpenAPI, portal
auth + RBAC (§7) with **real SMTP email (§9.3)** for OTP/welcome, the **admin
portal (§6.1)**, **merchant portal (§6.2)** and **landing site (§6.3)** — Next.js
apps incl. admin **Manage-Account / Configurations**, **User Management** (create
users + roles), **Security** (append-only audit-log viewer + session revoke) and
**Notifications** (low-float / given-up-webhook / dispute / approval alerts) and
**Reports** (CSV export over transactions/settlements, also in the merchant portal) —
**TLS/HTTPS at the edge
(§10)** with HSTS, security headers and Certbot auto-renewal, and automated
**encrypted backups (§7.8)** with a tested restore — plus the migration runner,
role provisioning, and money-safety lint.

TLS: Nginx terminates HTTPS, forces redirect + HSTS, and proxies by hostname; a
single Let's Encrypt SAN cert covers all five hostnames, issued/renewed by the
`ic-certbot` container. See `nginx/TLS.md` — `docker compose up -d` then
`./scripts/init-letsencrypt.sh`.

Backups: `ic-backup` takes scheduled, AES-256-encrypted `pg_dump` backups with a
tested restore path (`backup/README.md`). Deploys run `./scripts/migrate.sh`,
which backs up before migrating (SEC-B4). Set `BACKUP_ENCRYPTION_KEY` and an
off-site `BACKUP_UPLOAD_CMD` for production (SEC-B1).

The landing site (`services/ic-landing`) is a static marketing page (no DB, no
DB role per §6.3) with SEO metadata; it links to the merchant portal via
build-time `NEXT_PUBLIC_MERCHANT_URL`. No "Bank of Zambia Licensed" claim until
authorization is confirmed (LEGAL-1).

Email (`services/ic-api/src/email`) uses nodemailer over authenticated SMTP; set
`SMTP_*` (see `docs/EMAIL.md` for SPF/DKIM/DMARC). Leave `SMTP_HOST` empty + use
`AUTH_EXPOSE_OTP=true` for local dev without a mail server.

Both portals (`services/ic-admin`, `services/ic-merchant`) are Next.js apps calling
the API with session cookies. The merchant portal includes a public marketing
landing + Getting-Started onboarding, and every data view is scoped to the
authenticated merchant (NN-6). Set `NEXT_PUBLIC_API_URL` (build-time) to the API
origin, and `COOKIE_SECURE=false` on the API for local http dev.

Settlement/reconciliation run as one-shot jobs (cron / compose `tools` profile):

```bash
docker compose --profile tools run --rm ic-settlement-run
docker compose --profile tools run --rm -e RECON_REPORT_FILE=/reports/mtn.json ic-reconcile-run
```

> Note: onboarding/admin/settlement write operations require the admin DB role
> (ic_app_admin); when the admin portal (§6/§7) lands, these run under that role
> or move into the admin-portal backend.

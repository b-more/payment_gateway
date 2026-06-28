# Backups & recovery (§7.8)

`ic-backup` runs scheduled, **encrypted** `pg_dump` backups of the shared database
and prunes old local copies. Restore is a decrypt + `pg_restore`. The encryption
key and DB secrets live in a password manager, never in plaintext files (SEC-B3).

## What runs automatically (SEC-B1/B2)

The `ic-backup` container backs up on start and every `BACKUP_INTERVAL_SECONDS`
(default daily). Each backup is `pg_dump -Fc` piped through `openssl aes-256-cbc`
— a plaintext dump never touches disk. Local copies are retained per `BACKUP_KEEP`.

**Off-server copy is required for production** (SEC-B1) and is a no-op until
configured:

```env
BACKUP_REMOTE=s3://instacompay-backups
BACKUP_UPLOAD_CMD=aws s3 cp "$BACKUP_FILE" "$BACKUP_REMOTE/"
# or rclone: BACKUP_UPLOAD_CMD=rclone copy "$BACKUP_FILE" "$BACKUP_REMOTE"
```

## Before every deploy / migration (SEC-B4, DEP-7)

Use the wrapper, which takes a backup first, then migrates:

```bash
./scripts/migrate.sh
```

## Manual backup

```bash
docker compose run --rm --entrypoint /usr/local/bin/backup.sh ic-backup
```

## Restore (disaster recovery, SEC-B2)

```bash
# 1. ensure an empty target database exists
docker compose exec ic-postgres createdb -U "$POSTGRES_USER" instacompay_restore

# 2. decrypt + restore a chosen backup into it
docker compose run --rm --entrypoint /usr/local/bin/restore.sh ic-backup \
  /backups/instacompay-YYYYMMDDThhmmssZ.dump.enc \
  postgres://USER:PASS@ic-postgres:5432/instacompay_restore

# 3. verify row counts, then repoint the apps' DATABASE_URL and restart
```

**Test your restore regularly** — a backup you cannot restore is not a backup
(SEC-B2). The same flow is exercised in CI/dev against a throwaway database.

## Rebuild from scratch (runbook, SEC-B3)

1. Provision the host; install Docker + Compose.
2. Pull the private repo; create `.env` from `.env.example` with secrets from the
   password manager (DB, Redis, JWT, `BACKUP_ENCRYPTION_KEY`, SMTP).
3. `docker compose up -d` (apps start on the self-signed bootstrap cert).
4. Retrieve the latest off-site backup; `restore.sh` into a fresh `instacompay` DB.
5. `./scripts/init-letsencrypt.sh` to issue TLS certs.
6. Smoke-test `/healthz` on each host and a signed `/v1` call.

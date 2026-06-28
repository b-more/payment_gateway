#!/bin/sh
# Encrypted PostgreSQL backup (SEC-B1/B2). Dumps the database (custom format),
# encrypts with AES-256 before it touches disk, prunes old local copies and
# (if configured) copies off-server. Never writes a plaintext dump.
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required (keep it in a password manager — SEC-B3)}"

DIR="${BACKUP_DIR:-/backups}"
KEEP="${BACKUP_KEEP:-14}"
mkdir -p "$DIR"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$DIR/instacompay-$TS.dump.enc"

echo "[backup] dumping database -> $FILE"
pg_dump -Fc "$DATABASE_URL" \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_ENCRYPTION_KEY -out "$FILE"
echo "[backup] encrypted backup written ($(wc -c < "$FILE") bytes)"

# Off-site copy (SEC-B1) — required in production. BACKUP_FILE is exposed to the cmd.
if [ -n "${BACKUP_REMOTE:-}" ] && [ -n "${BACKUP_UPLOAD_CMD:-}" ]; then
  export BACKUP_FILE="$FILE"
  echo "[backup] off-site upload -> $BACKUP_REMOTE"
  sh -c "$BACKUP_UPLOAD_CMD"
else
  echo "[backup] WARNING: off-site copy skipped — set BACKUP_REMOTE + BACKUP_UPLOAD_CMD (SEC-B1)"
fi

# Retain only the most recent local copies.
ls -1t "$DIR"/instacompay-*.dump.enc 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  echo "[backup] pruning $old"
  rm -f "$old"
done

echo "[backup] done"

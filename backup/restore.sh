#!/bin/sh
# Restore an encrypted backup (SEC-B2). Decrypts and pg_restores into the target
# database, which must already exist (createdb first for a clean rebuild).
#   restore.sh <backup.dump.enc> [TARGET_DATABASE_URL]
set -eu

: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"
FILE="${1:?usage: restore.sh <backup.dump.enc> [TARGET_DATABASE_URL]}"
TARGET="${2:-${DATABASE_URL:?target DATABASE_URL required}}"

echo "[restore] decrypting $FILE and restoring into the target database"
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY -in "$FILE" \
  | pg_restore --clean --if-exists --no-owner --no-privileges -d "$TARGET"
echo "[restore] done"

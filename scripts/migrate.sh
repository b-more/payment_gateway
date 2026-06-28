#!/bin/sh
# Deploy-time migration with a mandatory pre-migration backup (SEC-B4 / DEP-7).
# Run from the gateway directory with the stack up.
set -e

echo "==> Pre-migration backup (SEC-B4 / DEP-7)"
docker compose run --rm --entrypoint /usr/local/bin/backup.sh ic-backup

echo "==> Applying migrations"
docker compose --profile tools run --rm ic-migrate

echo "==> Done"

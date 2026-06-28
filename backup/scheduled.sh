#!/bin/sh
# Scheduled backup loop (SEC-B1). Runs a backup immediately, then every
# BACKUP_INTERVAL_SECONDS. A failed run is logged and retried next cycle.
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
echo "[backup] scheduler started — interval ${INTERVAL}s"
trap 'exit 0' TERM INT
while true; do
  /usr/local/bin/backup.sh || echo "[backup] run failed (will retry next cycle)"
  sleep "$INTERVAL" &
  wait $!
done

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Auto-heal: restart any app container whose Docker healthcheck reports
# "unhealthy". Docker's restart policy (unless-stopped) only fires when a
# process EXITS — it does NOT act on a failing healthcheck. A Next.js standalone
# server that hangs (event loop wedged) stays "running" but stops serving, which
# is what produced the intermittent 504s on the landing site. This watcher
# covers that gap. Run from cron, flock-guarded, every couple of minutes.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

COMPOSE="/var/www/html/gateway/docker-compose.yml"
CONTAINERS=(ic-landing ic-merchant ic-admin ic-api ic-nginx)

for c in "${CONTAINERS[@]}"; do
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$c" 2>/dev/null || echo "missing")
  if [ "$health" = "unhealthy" ]; then
    printf '%s %s is unhealthy -> restarting\n' "$(date -u +%FT%TZ)" "$c"
    docker compose -f "$COMPOSE" restart "$c" >/dev/null 2>&1 || docker restart "$c" >/dev/null 2>&1 || \
      printf '%s FAILED to restart %s\n' "$(date -u +%FT%TZ)" "$c"
  fi
done

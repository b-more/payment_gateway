#!/bin/sh
# Obtain the initial Let's Encrypt SAN certificate covering all hostnames
# (§10.2, TLS-3). Run once from the gateway directory after:
#   1. the stack is up (`docker compose up -d`), and
#   2. DNS for the hostnames resolves to this host, DNS-only/unproxied (DNS-1).
#
# Env:
#   CERTBOT_EMAIL  registration email (default admin@instacompayzm.com)
#   STAGING=1      use the Let's Encrypt staging CA while testing (avoids rate limits)
#   DOMAINS        override the -d list (default: the five prod hostnames)
set -e

EMAIL="${CERTBOT_EMAIL:-admin@instacompayzm.com}"
DOMAINS="${DOMAINS:--d instacompayzm.com -d www.instacompayzm.com -d admin.instacompayzm.com -d merchants.instacompayzm.com -d api.instacompayzm.com}"

STAGING_FLAG=""
[ "${STAGING:-0}" = "1" ] && STAGING_FLAG="--staging"

echo "Requesting certificate for: ${DOMAINS}"
docker compose run --rm --entrypoint certbot ic-certbot \
  certonly --webroot -w /var/www/certbot \
  --email "${EMAIL}" --agree-tos --no-eff-email ${STAGING_FLAG} \
  --cert-name instacompayzm.com ${DOMAINS}

echo "Reloading Nginx to load the new certificate…"
docker compose exec ic-nginx nginx -s reload

echo "Done. Verify renewal with:  docker compose run --rm --entrypoint certbot ic-certbot renew --dry-run"

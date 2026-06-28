#!/bin/sh
set -e

# Ensure a certificate exists so Nginx can start before Certbot has issued the
# real one (§10.2). If the live cert is missing, generate a short-lived
# self-signed bootstrap; init-letsencrypt.sh then replaces it with the real
# Let's Encrypt SAN cert and reloads.
DOMAIN="instacompayzm.com"
LIVE="/etc/letsencrypt/live/${DOMAIN}"

if [ ! -f "${LIVE}/fullchain.pem" ]; then
    echo "[nginx] no certificate for ${DOMAIN} — generating a self-signed bootstrap cert"
    mkdir -p "${LIVE}"
    openssl req -x509 -nodes -newkey rsa:2048 -days 3 \
        -keyout "${LIVE}/privkey.pem" -out "${LIVE}/fullchain.pem" \
        -subj "/CN=${DOMAIN}" >/dev/null 2>&1
fi

# Reload periodically to pick up renewed certificates (TLS-1).
( while true; do sleep 21600; nginx -s reload 2>/dev/null || true; done ) &

exec nginx -g 'daemon off;'

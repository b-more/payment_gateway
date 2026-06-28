# TLS & DNS (§10)

The edge (`ic-nginx`) terminates TLS, forces HTTPS, sets HSTS + security headers
(SEC-N4, SEC-D1), and proxies by hostname to the four apps. `ic-certbot` issues
and auto-renews a single Let's Encrypt SAN certificate covering all five
hostnames (TLS-3).

## How certificates work here

The proxy is containerized, so §10.2's host-level `certbot --nginx` is adapted to
a **webroot** flow:

1. On first boot, the Nginx entrypoint mints a **self-signed bootstrap cert** so
   the container starts before any real cert exists.
2. Nginx serves the ACME HTTP-01 challenge from a shared webroot and redirects
   everything else to HTTPS (TLS-2).
3. `scripts/init-letsencrypt.sh` runs Certbot once to obtain the real SAN cert
   and reloads Nginx.
4. `ic-certbot` runs `certbot renew` every 12h; Nginx reloads every 6h to pick up
   renewed certs (TLS-1). Verify with `certbot renew --dry-run`.

```bash
docker compose up -d                 # stack starts on the self-signed bootstrap cert
STAGING=1 ./scripts/init-letsencrypt.sh   # test against the staging CA first
./scripts/init-letsencrypt.sh             # then issue the real certificate
```

## DNS (Cloudflare, §10.1)

App records (apex, www, admin, merchants, api) are **DNS-only / unproxied** during
dev so HTTP-01 works and real client IPs are visible (DNS-1). If you later enable
the Cloudflare proxy (DNS-2): switch Certbot to the DNS-01 challenge and uncomment
the `CF-Connecting-IP` real-ip block in `nginx.conf` so IP whitelist + audit IPs
stay correct. Never proxy mail records (DNS-3). DMARC starts at `p=none` and
tightens to `quarantine` → `reject` (DNS-4) — see `services/ic-api/docs/EMAIL.md`.

## Notes

- One SAN cert (`-cert-name instacompayzm.com`) serves every server block via
  `conf.d/tls.inc`.
- The admin server has a commented `allow/deny` block to optionally restrict the
  console to office/VPN IPs (SEC-N3).
- Edge rate limits: `api` 20r/s and `auth` 5r/s zones (complement app-level limits).

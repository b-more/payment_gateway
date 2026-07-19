# Shared proxy headers. Forwards the real client IP so the app tier can use it
# for the live-key IP whitelist (SEC-API4) and audit logging (SEC-AU2). Behind
# Cloudflare proxy this must read CF-Connecting-IP instead (DNS-2).
proxy_http_version 1.1;
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
# SECURITY: SET these rather than pass through / append, so a caller cannot
# spoof its source IP and defeat the live-key allowlist (SEC-API4).
# $remote_addr is already the true client: the real_ip module rewrites it from
# CF-Connecting-IP ONLY when the peer is a Cloudflare address, so a forged
# header on a direct-to-origin connection is ignored.
# ($proxy_add_x_forwarded_for would APPEND to the client's value, leaving the
#  attacker-controlled entry first; an untouched CF-Connecting-IP was trusted.)
proxy_set_header X-Forwarded-For   $remote_addr;
proxy_set_header CF-Connecting-IP  $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Upgrade           $http_upgrade;
proxy_set_header Connection        $connection_upgrade;
proxy_read_timeout 60s;

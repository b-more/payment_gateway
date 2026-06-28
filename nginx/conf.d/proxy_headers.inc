# Shared proxy headers. Forwards the real client IP so the app tier can use it
# for the live-key IP whitelist (SEC-API4) and audit logging (SEC-AU2). Behind
# Cloudflare proxy this must read CF-Connecting-IP instead (DNS-2).
proxy_http_version 1.1;
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Upgrade           $http_upgrade;
proxy_set_header Connection        $connection_upgrade;
proxy_read_timeout 60s;

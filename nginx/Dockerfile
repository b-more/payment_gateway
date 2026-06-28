# Edge reverse proxy (NN-5). Minimal base image (DEP-3, SEC-N5). openssl is used
# only to mint a self-signed bootstrap cert so Nginx starts before Certbot runs.
FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

# Replace the stock config with ours (TLS, security headers, hostname routing).
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/ /etc/nginx/conf.d/
COPY docker-entrypoint.sh /docker-entrypoint-ic.sh
RUN chmod +x /docker-entrypoint-ic.sh

EXPOSE 80 443
ENTRYPOINT ["/docker-entrypoint-ic.sh"]

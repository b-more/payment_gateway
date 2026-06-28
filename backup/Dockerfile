# Backup sidecar: PostgreSQL client tools (pg_dump/pg_restore) + openssl (DEP-3).
FROM postgres:16-alpine

RUN apk add --no-cache openssl

COPY backup.sh restore.sh scheduled.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh /usr/local/bin/scheduled.sh

ENTRYPOINT ["/usr/local/bin/scheduled.sh"]

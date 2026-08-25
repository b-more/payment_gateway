# Multi-stage build (DEP-3). Minimal base, runs as non-root (SEC-N5).
# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8030
# Central Africa Time (Lusaka, UTC+2, no DST) so OS-level time — shell `date`,
# logs, cron — is correct. Node also honors TZ via its bundled ICU data, and
# Postgres stores timestamptz in UTC regardless (display is converted).
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Africa/Lusaka /etc/localtime && \
    echo "Africa/Lusaka" > /etc/timezone
ENV TZ=Africa/Lusaka
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY package.json ./
USER node
EXPOSE 8030
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8030)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

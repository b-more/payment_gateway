# Airtel Zambia integration

Live processor for Airtel Money (Collections, Disbursements, KYC, Balance) behind
the money engine. Only **PRODUCTION** merchant accounts reach Airtel; SANDBOX
accounts keep the simulator (TXN-5). All live dispatch is gated by
`AIRTEL_ENABLED` — until it is `true`, this module is inert.

## Architecture

```
src/airtel/
  airtel.config.ts            per-env (PROD/STAGING) profiles from env; AIRTEL_ENV selects
  airtel-token.manager.ts     180s token cache, proactive refresh ~150s, single-flight, 401->refresh
  airtel.client.ts            headers (X-Country/X-Currency + bearer), timeout->indeterminate, 401 retry
  airtel.errors.ts            typed taxonomy (IP_NOT_ALLOWED / SERVICE_NOT_ENABLED / NO_ROUTE / AUTH / TIMEOUT ...)
  money.ts                    ngwee(bigint) <-> kwacha 2dp (no float on money)
  airtel-attempt.ts           per-attempt state machine + status mapping (TS->SUCCESS) + unique id gen
  airtel-attempts.repository   attempts + append-only events (redacted raw)
  airtel-payments.service      collections (USSD push) + enquiry
  airtel-disbursements.service B2C payout + RSA PIN + enquiry
  airtel.crypto.ts            RSA/PKCS1 PIN encryption (Airtel public key)
  airtel-kyc.service           validate-payer (redacted)
  airtel-balance.service       feature-flagged balance
  airtel-dispatch.service      bridges outcomes -> TransactionService.completeTransaction (idempotent)
  airtel-callback.controller   POST /v1/processors/airtel/callback (public, rate-limited)
```

Data: `airtel_attempts` (+ `airtel_attempt_events`) — migration `0014_airtel.sql`.

## Configuration (.env)

| Var | Meaning |
|---|---|
| `AIRTEL_ENABLED` | master switch for live dispatch (default `false`) |
| `AIRTEL_ENV` | `PRODUCTION` \| `STAGING` — which Airtel env live dispatch targets |
| `AIRTEL_COUNTRY` / `AIRTEL_CURRENCY` | `ZM` / `ZMW` |
| `AIRTEL_BALANCE_ENABLED` | Balance Enquiry flag (403 until Airtel enables it) |
| `AIRTEL_HTTP_TIMEOUT_MS` | per-request timeout (default 15000) |
| `AIRTEL_PROD_BASE_URL` | `https://openapi.airtel.co.zm` |
| `AIRTEL_PROD_CLIENT_ID` / `_CLIENT_SECRET` | OAuth client credentials |
| `AIRTEL_PROD_PUBLIC_KEY` | base64 DER/SPKI 1024-bit RSA key (disbursement PIN) |
| `AIRTEL_PROD_DISBURSE_PIN` | 4–8 digit wallet PIN (never logged) |
| `AIRTEL_STAGING_*` | same keys for the UAT (`openapiuat`) profile |
| `AIRTEL_RECON_MIN_AGE_SEC` / `AIRTEL_RECON_STALE_HOURS` | reconcile tuning |

Secrets live only in `.env` (git-ignored, `chmod 600`); never in code or logs.

## Deployment (Docker, not systemd)

This gateway runs in Docker Compose; the containers already run as the non-root
`node` user, and secrets are injected via `env_file: .env`. The reconciliation
job runs as a one-shot `tools`-profile service (cron-triggered):

```bash
docker compose --profile tools run --rm ic-airtel-reconcile
```

> If you ever run the API outside Docker, an equivalent hardened unit is a
> `systemd` service with `User=ic`, `EnvironmentFile=/etc/instacompay/.env`
> (mode 600), `NoNewPrivileges=yes`, and a `systemd` timer calling
> `npm run airtel:reconcile`.

## Go-live checklist

1. Fill `AIRTEL_PROD_*` in `.env`. Set `AIRTEL_ENV=PRODUCTION`.
2. **Whitelist our egress IP with Airtel** (see the IP-not-allowed runbook item).
3. Register the callback URL with Airtel: `https://api.instacompayzm.com/v1/processors/airtel/callback`.
4. Apply migrations: `docker compose --profile tools run --rm ic-migrate`.
5. Flip `AIRTEL_ENABLED=true`, redeploy `ic-api`.
6. Run a tiny real collection + disbursement; confirm via enquiry/callback.
7. Schedule `ic-airtel-reconcile` (e.g. every 15 min).

## Manual test (curl)

```bash
# Collection (via the /v1 API, HMAC-signed — see docs/API.md for signing):
curl -X POST https://api.instacompayzm.com/v1/collections \
  -H 'X-Idempotency-Key: INV-000123' -H 'content-type: application/json' \
  -d '{"processor":"AIRTEL","amount":"150","msisdn":"260975020473","collectionReference":"INV-000123"}'

# Staff KYC pre-check (admin session cookie):
curl https://api.instacompayzm.com/v1/admin/airtel/kyc/260975020473

# Balance (feature-flagged):
curl 'https://api.instacompayzm.com/v1/admin/airtel/balance?type=COLL'

# Approve + dispatch a disbursement (ADMIN):
curl -X POST https://api.instacompayzm.com/v1/admin/airtel/disbursements/<txnId>/dispatch \
  -H 'content-type: application/json' -d '{"msisdn":"975020473","amount":"5000"}'
```

## Runbook

**`403 "IP address not allowed: <ip>"`** — our egress IP isn't whitelisted with
Airtel. The failing IP is logged in the error. Send it to Airtel to whitelist;
do **not** retry. (Find our egress IP: `curl https://ifconfig.me` from the
`ic-api` container's network.)

**`403 "You cannot consume this service"`** — the product isn't enabled on our
profile (currently Balance). Keep the feature flag off; ask Airtel to enable.

**`404 "no Route matched"`** — Airtel gateway-side outage. Retryable with backoff;
the reconcile job keeps re-enquiring. Alert if it persists.

**`504` / timeouts / `UNKNOWN` attempts** — the request may have succeeded
server-side. We never blind-retry a POST. The attempt is marked `UNKNOWN`; the
reconcile job re-enquires and resolves it. To check now:
`docker compose --profile tools run --rm ic-airtel-reconcile`.

**"Parent says they paid but it's not showing"** — find the attempt:
```sql
SELECT airtel_txn_id, airtel_money_id, state, amount_ngwee, transaction_id, updated_at
FROM airtel_attempts WHERE msisdn = '975020473' ORDER BY created_at DESC LIMIT 5;
```
If state is `PENDING`/`UNKNOWN`, run the reconcile job to force an enquiry. The
`airtel_money_id` (e.g. `MP260702.2347.B23113`) + `request_id` are what Airtel
support needs.

# MTN MoMo integration

Live processor for MTN Mobile Money (Collections + Disbursements), sibling to the
Airtel module. Only PRODUCTION accounts reach MTN, and only when `MTN_ENABLED=true`.

## Auth model (differs from Airtel)

Per **product** (Collection, Disbursement), each with its own credentials:
- **Subscription key** (`Ocp-Apim-Subscription-Key`)
- **API User** + **API Key** → token via `POST /{product}/token/` with
  `Authorization: Basic base64(apiUser:apiKey)` + the subscription-key header.

Every call also sends `X-Target-Environment: mtnzambia`, the product subscription
key, and (on POSTs) `X-Reference-Id` — a UUID we generate that is both the
idempotency key and the id used for status polling.

## Configuration (.env)

| Var | Meaning |
|---|---|
| `MTN_ENABLED` | master switch for live dispatch |
| `MTN_ENV` | `PRODUCTION` \| `SANDBOX` (selects base URL) |
| `MTN_TARGET_ENVIRONMENT` | `mtnzambia` |
| `MTN_CURRENCY` | `ZMW` |
| `MTN_PROD_BASE_URL` | `https://proxy.momoapi.mtn.com` |
| `MTN_COLLECTION_SUBSCRIPTION_KEY` / `_API_USER` / `_API_KEY` | Collection product |
| `MTN_DISBURSEMENT_SUBSCRIPTION_KEY` / `_API_USER` / `_API_KEY` | Disbursement product |

## Flow

- **Collection**: `POST /collection/v1_0/requesttopay` (202, empty body) → attempt
  PENDING → poll `GET /collection/v1_0/requesttopay/{refId}` → `SUCCESSFUL` |
  `FAILED` (+ reason, e.g. `PAYER_NOT_FOUND`) | `PENDING`.
- **Disbursement**: `POST /disbursement/v1_0/transfer` → poll
  `GET /disbursement/v1_0/transfer/{refId}`. No PIN. Requires an `approvalRef`
  (admin approval gate) — dispatched via `POST /v1/admin/mtn/disbursements/:txnId/dispatch`.
- Async resolution: **status polling** (portal resolve-on-read) + the
  reconciliation job. Amounts are 2-dp ZMW strings; money stays integer ngwee
  internally.

## Numbers

MTN Zambia MSISDNs use `096`/`076` prefixes (Airtel is `097`). The payer/payee
`partyId` is the full international MSISDN, e.g. `260960000000` — `mtnPartyId`
normalises to that. A collection to a non-MTN number returns `PAYER_NOT_FOUND`.

## Test / operate

```bash
# direct smoke (real creds, no engine/DB) — use a real MTN number:
docker exec ic-api node dist/jobs/mtn-smoke.js collect  260960000000 150   # K1.50
docker exec ic-api node dist/jobs/mtn-smoke.js disburse 260960000000 500   # needs disbursement sub key

# reconciliation (cron / one-shot):
docker compose --profile tools run --rm ic-mtn-reconcile
```

Go-live: fill `MTN_*` in `.env`, set `MTN_ENABLED=true`, restart `ic-api`,
schedule `ic-mtn-reconcile`. Merchants collect via the portal / `/v1/collections`
with `processor: "MTN"`.

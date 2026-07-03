# Instacompay /v1 API

Base URL: `https://api.instacompayzm.com/v1` — the **same host for SANDBOX and
PRODUCTION**; your credential (`ic_sand_…` vs `ic_live_…`) determines the
environment. Interactive spec (Swagger UI): `/docs`. OpenAPI JSON: `/docs-json`
— import this into Postman.

## Authentication (dual-key, SEC-API2/3)

Each credential has two secrets, shown once at generation:
- **API secret** — stored hashed, identifies the credential (NN-7).
- **Signing key** — used to sign requests with HMAC-SHA256.

Every request sends three headers; mutating requests also send `Idempotency-Key`:

| Header | Value |
|---|---|
| `X-Api-Key` | the public api_key, e.g. `ic_live_…` |
| `X-Timestamp` | current Unix time in **seconds** (must be within ±5 min) |
| `X-Signature` | `HMAC_SHA256(signingKey, "<timestamp>.<METHOD>.<path>.<rawBody>")` as hex |
| `Idempotency-Key` | unique per mutating request (collections, disbursements, reverse) |

`<path>` is the full request path including `/v1` and any query string. `<rawBody>`
is the exact JSON body sent (empty string for GET).

Endpoints: `POST /v1/collections`, `POST /v1/disbursements`,
`GET /v1/transactions/{id}`, `POST /v1/transactions/{id}/reverse`,
`GET /v1/accounts/{id}/balance`, `GET /v1/settlements`.

Money is integer **ngwee** as JSON strings (NN-1; K1.50 = `"150"`). Errors:
`{ "error": { "code", "message" } }` with codes `VALIDATION_ERROR`,
`INVALID_SIGNATURE`, `DUPLICATE_REQUEST`, `IP_NOT_WHITELISTED`, `ACCOUNT_NOT_LIVE`,
`INSUFFICIENT_FLOAT`, `RATE_LIMITED`.

## Supported processors

`AIRTEL` (live), `MTN`, `ZAMTEL`, `ZED_MOBILE`, `VISA`. Send the exact enum value
in `processor`. Which rails your account can use in `PRODUCTION` depends on your
provisioning; `SANDBOX` credentials simulate all of them deterministically (an
MSISDN ending `0000` declines).

## Collection lifecycle (async) — read this before integrating

Collections are **asynchronous**. `POST /v1/collections` does not return a final
result — it debits nothing yet and returns the transaction in `PROCESSING` while
the customer approves a prompt (e.g. Airtel USSD/PIN) on their phone. Resolve the
final state one of two ways (use both for reliability):

1. **Webhook** (recommended): we POST a signed `transaction.success` /
   `transaction.failed` event to your account `callback_url` (see Webhooks below).
2. **Polling**: `GET /v1/transactions/{id}` until `status` is terminal.

Transaction `status` values: `PENDING` → `PROCESSING` → `SUCCESS` | `FAILED`
(and `REVERSED` / `EXPIRED`). **Never treat `PROCESSING` as paid.** Each attempt
is idempotent on your `Idempotency-Key` — a retry with the same key returns the
original transaction, never a second charge.

Response shape (collections, disbursements, status):

```json
{ "id": "…", "type": "COLLECTION", "processor": "AIRTEL", "msisdn": "260975020473",
  "amount": "150", "charge": "0", "net_amount": "150", "status": "PROCESSING",
  "collection_reference": "INV-000123", "environment": "PRODUCTION",
  "created_at": "2026-07-03T06:00:00.000Z" }
```

## cURL

```bash
API_KEY="ic_sand_..."; SIGNING_KEY="base64signingkey..."
TS=$(date +%s)
BODY='{"processor":"AIRTEL","amount":"150","msisdn":"260975020473","collectionReference":"INV-000123"}'
SIG=$(printf '%s.%s.%s.%s' "$TS" "POST" "/v1/collections" "$BODY" \
  | openssl dgst -sha256 -hmac "$SIGNING_KEY" -hex | sed 's/^.* //')

curl -sS https://api.instacompayzm.com/v1/collections \
  -H "X-Api-Key: $API_KEY" -H "X-Timestamp: $TS" -H "X-Signature: $SIG" \
  -H "Idempotency-Key: $(uuidgen)" -H 'Content-Type: application/json' \
  -d "$BODY"
```

## Node

```js
import crypto from 'node:crypto';

function sign(signingKey, method, path, rawBody, ts) {
  const msg = `${ts}.${method}.${path}.${rawBody}`;
  return crypto.createHmac('sha256', signingKey).update(msg).digest('hex');
}

const ts = Math.floor(Date.now() / 1000).toString();
const path = '/v1/collections';
const body = JSON.stringify({ processor: 'AIRTEL', amount: '150', msisdn: '260975020473' });

await fetch(`https://api.instacompayzm.com${path}`, {
  method: 'POST',
  headers: {
    'X-Api-Key': process.env.API_KEY,
    'X-Timestamp': ts,
    'X-Signature': sign(process.env.SIGNING_KEY, 'POST', path, body, ts),
    'Idempotency-Key': crypto.randomUUID(),
    'Content-Type': 'application/json',
  },
  body,
});
```

## PHP

```php
<?php
$ts   = (string) time();
$path = '/v1/collections';
$body = json_encode(['processor' => 'AIRTEL', 'amount' => '150', 'msisdn' => '260975020473']);
$sig  = hash_hmac('sha256', "$ts.POST.$path.$body", getenv('SIGNING_KEY'));

$ch = curl_init("https://api.instacompayzm.com$path");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    'X-Api-Key: ' . getenv('API_KEY'),
    'X-Timestamp: ' . $ts,
    'X-Signature: ' . $sig,
    'Idempotency-Key: ' . bin2hex(random_bytes(16)),
    'Content-Type: application/json',
  ],
  CURLOPT_POSTFIELDS => $body,
]);
echo curl_exec($ch);
```

## Portal auth (§7)

Realm-separated (admin/merchant), password → email OTP → rotating session cookies.

```
POST /v1/auth/{realm}/login       {email,password}            -> 200 {challengeId}  (emails a 6-digit OTP)
POST /v1/auth/{realm}/verify-otp  {challengeId,code}          -> 200 + httpOnly cookies (session + refresh)
POST /v1/auth/{realm}/refresh                                 -> 200 (rotates; old refresh is revoked)
POST /v1/auth/{realm}/logout                                  -> 200 (revokes the session)
GET  /v1/auth/{realm}/me                                      -> 200 {userId,scope,roles,merchantId}
```

`{realm}` is `admin` (SYSTEM scope) or `merchant` (MERCHANT scope); sessions use
separate cookie names and never cross realms (SEC-A4). Access tokens are HS256
JWTs (≤15m); refresh tokens are opaque, stored hashed, and rotate on use (SEC-A3).
Five failed logins lock the account (SEC-A5). Passwords and API secrets are
argon2id-hashed (SEC-A2/NN-7). RBAC is enforced server-side on every endpoint
(SEC-Z1).

### Admin actions (SYSTEM realm, role-gated — SEC-Z3)

```
POST /v1/admin/merchants/{id}/review          COMPLIANCE|ADMIN  approve/reject (ONB-3)
POST /v1/admin/merchants/{id}/accounts        ADMIN             provision account + credentials (ONB-4)
POST /v1/admin/accounts/{id}/promote          ADMIN             promote to PRODUCTION (ONB-8)
POST /v1/admin/accounts/{id}/float-credit     FINANCE|ADMIN     credit float (FLOAT-2/3)
POST /v1/admin/float-requests/{id}/approve    FINANCE|ADMIN     dual-control approval (FLOAT-3)
```

## Onboarding (§5.1)

Public application — no auth (the applicant has no credentials yet), rate-limited:

```bash
curl -sS https://api.instacompayzm.com/onboarding/applications \
  -H 'Content-Type: application/json' \
  -d '{"merchant":{"name":"Acme Traders Ltd","merchantType":"PRIVATE","email":"ops@acme.co.zm"},
       "admin":{"name":"Jane Banda","email":"jane@acme.co.zm"}}'
# 202 { "merchant_id": "…",
#       "message": "We have received your merchant onboarding application. …" }
```

Compliance review, account provisioning (which issues the SANDBOX + LIVE
credential pairs, shown once), and promotion to PRODUCTION are admin-portal
actions and require admin auth (§7).

## Webhooks (§5.7)

When a transaction reaches a final state (`SUCCESS`, `FAILED`, `REVERSED`,
`EXPIRED`) Instacompay POSTs a signed JSON event to your account's `callback_url`.
Delivery is asynchronous; failures retry with backoff `1m, 5m, 30m, 2h, 6h` then
`GIVEN_UP`. Every attempt is recorded.

Headers: `X-Instacompay-Event: transaction.success`, and
`X-Instacompay-Signature: t=<unix>,v1=<hex>` where
`hex = HMAC_SHA256(webhook_signing_secret, "<t>.<rawBody>")`.

Body:

```json
{
  "id": "evt_…",
  "type": "transaction.success",
  "created_at": "2026-06-27T12:00:00.000Z",
  "data": { "id": "…", "amount": "100000", "charge": "500", "net_amount": "100000",
            "status": "SUCCESS", "processor": "MTN", "environment": "PRODUCTION" }
}
```

Verify before trusting an event (Node):

```js
import crypto from 'node:crypto';

function verify(secret, header, rawBody) {
  const m = /^t=(\d+),v1=([0-9a-f]+)$/.exec(header);            // X-Instacompay-Signature
  if (!m) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${m[1]}.${rawBody}`).digest();
  const got = Buffer.from(m[2], 'hex');
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}
```


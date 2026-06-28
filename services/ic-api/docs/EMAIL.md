# Email delivery (§9.3)

Transactional email — OTP (SEC-A1) and onboarding welcome (ONB-7) — is sent over
authenticated SMTP via `EmailService` (nodemailer).

## Configuration

| Env | Purpose |
|---|---|
| `SMTP_HOST` | SMTP server (Hostinger). **Empty ⇒ emails are not sent** (dev) |
| `SMTP_PORT` | 587 (STARTTLS) or 465 (implicit TLS) |
| `SMTP_USER` / `SMTP_PASSWORD` | authenticated mailbox |
| `SMTP_FROM` | envelope/From address, e.g. `noreply@instacompayzm.com` |
| `SMTP_FROM_NAME` | sender display name (default `Instacom Payment Solutions`) |
| `MERCHANT_PORTAL_URL` | portal link in the welcome email (default `https://merchants.instacompayzm.com`) |

All transactional mail is sent as **branded multipart HTML** (instac•m header,
ZMW / Bank-of-Zambia footer) with a plain-text fallback — see
`src/email/templates.ts`. OTP and reset codes render in a highlighted code
block; the welcome mail carries the public sandbox `api_key` and a dashboard
button.

OTP mails contain only the code; welcome mails contain the public `api_key` and
never a secret. Sends are best-effort and never throw, so a mail outage cannot
break login or onboarding.

For local dev without a mail server, leave `SMTP_HOST` empty and set
`AUTH_EXPOSE_OTP=true` so the login response returns the code.

## DNS records (deliverability)

OTP/reset/alert mail only reaches inboxes if the domain is authenticated
(§9.3, §10.1). Configure in Cloudflare (mail records are **DNS-only**, never
proxied — DNS-3):

- **SPF** — TXT on the apex authorizing Hostinger's senders, e.g.
  `v=spf1 include:_spf.hostinger.com ~all`
- **DKIM** — the 3 `*._domainkey` CNAME/TXT records Hostinger provides.
- **DMARC** — TXT at `_dmarc`, starting permissive then tightening (DNS-4):
  `p=none` → `p=quarantine` → `p=reject`, e.g.
  `v=DMARC1; p=none; rua=mailto:dmarc@instacompayzm.com`

Verify with `dig TXT instacompayzm.com`, `dig TXT _dmarc.instacompayzm.com`, and a
test send before promoting DMARC past `p=none`.

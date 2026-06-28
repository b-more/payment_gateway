# Instacompay Gateway — Build Specification & Source of Truth

> **Purpose of this document.** This is the authoritative specification for building the Instacompay payment gateway. Claude Code MUST treat this file as the single source of truth. Before and after implementing any feature, re-read the relevant section and validate the implementation against it. Where this document and any other instruction conflict, **this document wins** unless the user explicitly overrides it in conversation.
>
> **How to use this file for validation.** Every requirement is tagged with an ID (e.g. `FLOAT-3`). When you complete work, state which requirement IDs you satisfied and confirm the acceptance criteria are met. The **Validation Checklist** at the end is the final gate before any milestone is considered done.

---

## 0. Document Control

| Field | Value |
|---|---|
| Product | Instacompay Payment Gateway |
| Operating entity | Instacom Payment Solutions Limited |
| Address | 6755 Elasah House, Along Chainama Road, Olympia Extension, Lusaka, Zambia |
| Currency | **ZMW (Zambian Kwacha)** — stored as integer minor units (ngwee). 1 ZMW = 100 ngwee. |
| Jurisdiction | Zambia (Bank of Zambia regulated — see LEGAL-1) |
| Status | v1 build specification |

---

## 1. Scope & Non-Negotiables

These are the rules that override convenience. Violating any one is a build failure.

| ID | Non-negotiable |
|---|---|
| NN-1 | **All money is stored as integer minor units (ngwee).** Never use floating-point for any monetary value, anywhere — not in DB, not in app code, not in JSON. |
| NN-2 | **Every change to a balance is a row in a double-entry ledger.** A balance is always derived from / reconcilable to the ledger. Never blindly `SET balance = x`. |
| NN-3 | **Currency is ZMW everywhere.** No UGX, no other currency strings. Scrub any inherited Ugandan/other artifacts. |
| NN-4 | **The four apps share ONE PostgreSQL database** but run as separate services/containers. |
| NN-5 | **Only the reverse proxy is public.** App containers bind to internal ports; the database is never publicly reachable. |
| NN-6 | **Merchant-portal data access is always scoped to the authenticated merchant's `account_id`(s).** A merchant must be structurally unable to read another merchant's data. |
| NN-7 | **API secrets are stored hashed.** Plaintext is shown exactly once at generation and never retrievable again. |
| NN-8 | **Every payment/float-mutating operation is idempotent and transactional** (DB transaction + row lock). |
| NN-9 | **Audit logs are append-only and immutable.** No update/delete on audit records. |
| NN-10 | **New accounts start in SANDBOX with zero float** and cannot process live money until explicitly promoted AND funded. |

---

## 2. System Architecture

### 2.1 Services & Ports (authoritative)

Four independent services, each in its own Docker container, fronted by Nginx. **Firewall opens only 80, 443, and SSH (restricted).** The application ports below are internal/host-mapped per the user's firewall allowance (8010/8020/8030/8040) but are **proxied by Nginx and not intended for direct public traffic** — production access is via HTTPS hostnames only.

| Service | Internal Port | Hostname (prod) | Hostname (dev) | Container name |
|---|---|---|---|---|
| Admin Portal | **8010** | `admin.instacompayzm.com` | `admin.dev.instacompayzm.com` | `ic-admin` |
| Business (Merchant) Portal | **8020** | `merchants.instacompayzm.com` | `merchants.dev.instacompayzm.com` | `ic-merchant` |
| API (gateway) | **8030** | `api.instacompayzm.com` | `api.dev.instacompayzm.com` | `ic-api` |
| Landing Page | **8040** | `instacompayzm.com` | `dev.instacompayzm.com` | `ic-landing` |
| PostgreSQL | 5432 (internal only) | — | — | `ic-postgres` |
| Redis | 6379 (internal only) | — | — | `ic-redis` |
| Nginx | 80 / 443 | all of the above | all | `ic-nginx` |

> **Firewall note for the user:** You said you will allow 8010/8020/8030/8040. Recommendation: allow them only on the host's internal/Docker network, NOT from the public internet. Public traffic should arrive on 443 → Nginx → container. If you must expose them, restrict by source IP. The database (5432) and Redis (6379) must NEVER be opened on the firewall.

### 2.2 Environments

| | Development | Production |
|---|---|---|
| Host | Hostinger VPS | Infratel |
| Public IP | `76.13.57.29` | `102.23.120.234` |
| Working dir | `/var/www/html/gateway` | TBD |
| Mode | sandbox processors, seeded fake data | live |
| Secrets | dev-only, separate | strong, separate, never reused from dev |

Code is environment-agnostic. The ONLY differences between environments live in `.env` files (never committed) and DNS. Dev and Production use **fully separate databases**.

### 2.3 Topology

```
Internet
   │  (443 only, public)
┌──┴───────────────┐
│      Nginx       │  TLS termination, HSTS, security headers, rate limiting
└──┬───────────────┘
   │ proxy by hostname (internal Docker network)
   ├─ instacompayzm.com         → ic-landing  :8040
   ├─ admin.instacompayzm.com   → ic-admin    :8010
   ├─ merchants.instacompayzm.com → ic-merchant :8020
   └─ api.instacompayzm.com     → ic-api      :8030
                  │
        ┌─────────┴──────────┐
        │  ic-postgres :5432 │  (internal network only)
        │  ic-redis    :6379 │  (internal network only)
        └────────────────────┘
```

---

## 3. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| API (gateway) | **Node.js + TypeScript** (NestJS recommended; Fastify/Express acceptable) | DECIDED: all-TypeScript stack. TypeScript mandatory (no plain JS). Money handled as integer ngwee only (NN-1) — enforce with a lint/test rule forbidding float math on money; use `bigint` or integer math. |
| Admin & Merchant portals | **React + TypeScript** (Next.js) | Dashboard ecosystem, charts, tables. |
| Landing page | **Next.js / Astro** or static | SEO-friendly, fast. |
| Database | **PostgreSQL 16** | ACID, `NUMERIC`/`BIGINT` money, row locking, JSONB metadata. |
| Cache / Queue / Idempotency store | **Redis 7** | Rate limits, idempotency keys, job queue, webhook retry queue. |
| Reverse proxy / LB | **Nginx** | TLS, security headers, upstreams. |
| Containerization | **Docker + Docker Compose** | One container per service. |
| Process supervision | Docker restart policies | `restart: unless-stopped`. |
| TLS | Let's Encrypt (Certbot) | Auto-renew. |

> **LANGUAGE DECISION (settled): all-TypeScript stack.** API in Node.js + TypeScript (NestJS recommended), portals in React + TypeScript (Next.js), landing in Next.js/Astro. One language across the whole codebase. Do NOT use plain JavaScript anywhere — `.ts`/`.tsx` only, `strict` mode on in `tsconfig`.
>
> **Money-safety rules for TypeScript (because JS `number` is a float):**
> - Store and pass all monetary values as integer **ngwee** using `bigint` (or a vetted integer/decimal money library). Never use JS `number` for money arithmetic.
> - Add an ESLint rule / unit tests that fail the build if a money field is typed as `number` or if float operators are applied to money.
> - Float-spend race safety comes from PostgreSQL `SELECT ... FOR UPDATE` inside a transaction (TXN-1), not from the language — implement it explicitly.
> - Validate all inbound money values are integers ≥ 0 at the API boundary.

---

## 4. Data Model

All tables in one shared database. All monetary columns are `BIGINT` (ngwee). All IDs are UUIDs unless stated. All tables have `created_at`, `updated_at` (timestamptz). Ledger and audit tables are **append-only**.

### 4.1 `merchants`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | text | Merchant business name |
| merchant_type | enum | `PUBLIC` \| `PRIVATE` |
| email | text | |
| phone | text | |
| status | enum | `PENDING` \| `APPROVED` \| `REJECTED` \| `SUSPENDED` |
| kyc_status | enum | `UNVERIFIED` \| `VERIFIED` \| `FAILED` |
| registered_at | timestamptz | |

### 4.2 `accounts` (multiple per merchant)
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | Display ID like `CA0000024` derived separately |
| merchant_id | UUID FK → merchants | |
| account_type | enum | `COLLECTION` \| `DISBURSEMENT` \| `OVA` \| `BANK` |
| operating_mode | enum | `SANDBOX` \| `PRODUCTION` — **defaults to SANDBOX** |
| float_balance | BIGINT | ngwee; **derived from ledger**, never set directly |
| low_float_threshold | BIGINT | alert trigger |
| status | enum | `ACTIVE` \| `SUSPENDED` |
| created_at | timestamptz | |

### 4.3 `api_credentials`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| account_id | UUID FK → accounts | |
| environment | enum | `SANDBOX` \| `LIVE` |
| api_key | text | Public identifier, e.g. `ic_live_xxx` / `ic_sand_xxx` |
| secret_hash | text | **HASH only** (argon2/bcrypt). Plaintext never stored. |
| status | enum | `ACTIVE` \| `REVOKED` |
| created_at | timestamptz | |
| last_rotated_at | timestamptz | |

### 4.4 `charge_configs`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| account_id | UUID FK | |
| processor | enum | `MTN` \| `AIRTEL` \| `ZAMTEL` \| `ZED_MOBILE` \| `VISA` |
| charge_fulfiller | enum | `SOURCE` (customer pays) \| `MERCHANT` (merchant pays) |
| charge_type | enum | `FIXED` \| `PERCENTAGE` \| `TIERED` |
| fixed_value | BIGINT | ngwee (for FIXED / TIERED) |
| percent_value | numeric(5,2) | percent (for PERCENTAGE / TIERED) |
| ova_account_ref | text | MNO OVA reference |

### 4.5 `account_settings`
| Column | Type | Notes |
|---|---|---|
| account_id | UUID FK | |
| callback_url | text | webhook target |
| webhook_signing_secret | text | for signing outgoing webhooks (rotatable) |
| ip_whitelist | text[] | allowed source IPs for live keys |

### 4.6 `float_ledger` (APPEND-ONLY, double-entry)
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| account_id | UUID FK | |
| entry_type | enum | `CREDIT` \| `DEBIT` |
| amount | BIGINT | ngwee, always positive |
| balance_after | BIGINT | running balance snapshot |
| reference | text | links to transaction/settlement/admin action |
| counterparty | text | e.g. `PLATFORM_FLOAT_SOURCE`, `PROCESSOR_MTN` |
| created_by | UUID | admin or system actor |
| created_at | timestamptz | |
> **No UPDATE or DELETE permitted on this table.** Corrections are new compensating entries.

### 4.7 `transactions`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| account_id | UUID FK | |
| type | enum | `COLLECTION` \| `DISBURSEMENT` |
| processor | enum | MTN/AIRTEL/ZAMTEL/ZED_MOBILE/VISA |
| msisdn | text | customer phone (for mobile money) |
| amount | BIGINT | ngwee |
| charge | BIGINT | ngwee |
| net_amount | BIGINT | what merchant receives |
| status | enum | `PENDING` \| `PROCESSING` \| `SUCCESS` \| `FAILED` \| `REVERSED` \| `EXPIRED` |
| failure_reason | text | e.g. `INSUFFICIENT_FLOAT` |
| idempotency_key | text | unique per account |
| collection_reference | text | merchant-supplied ref |
| environment | enum | `SANDBOX` \| `PRODUCTION` |
| created_at | timestamptz | |
| Constraint | | UNIQUE(account_id, idempotency_key) |

### 4.8 `settlements`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | Settlement ID |
| account_id | UUID FK | |
| amount | BIGINT | ngwee |
| bank_details | jsonb | destination |
| status | enum | `PENDING` \| `SETTLED` \| `FAILED` |
| settled_at | timestamptz | |

### 4.9 `webhook_deliveries`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| transaction_id | UUID FK | |
| url | text | |
| attempt | int | |
| response_code | int | |
| status | enum | `PENDING` \| `DELIVERED` \| `FAILED` \| `GIVEN_UP` |
| next_retry_at | timestamptz | |

### 4.10 `users` & `roles` (RBAC)
| Column (users) | Type | Notes |
|---|---|---|
| id | UUID PK | |
| scope | enum | `SYSTEM` (admin-side) \| `MERCHANT` |
| merchant_id | UUID FK nullable | set when scope=MERCHANT |
| name | text | |
| email | text | login username |
| phone | text | |
| status | enum | `INVITED` \| `ACTIVE` \| `DISABLED` |
| email_verified | bool | |

`roles`: `ADMIN`, `AUDITOR`, `FINANCE`, `RECONCILIATION`, `COMPLIANCE`, plus custom. `user_roles` join table. Permissions enforced server-side.

### 4.11 `audit_logs` (APPEND-ONLY)
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| actor_id | UUID | who |
| actor_scope | enum | SYSTEM/MERCHANT |
| action | text | e.g. `FLOAT_CREDIT`, `CREDENTIAL_GENERATED`, `MERCHANT_APPROVED`, `ROLE_ASSIGNED`, `MODE_CHANGED` |
| target | text | affected entity |
| metadata | jsonb | before/after where relevant |
| ip_address | text | |
| created_at | timestamptz | |
> **No UPDATE/DELETE.** This is the forensic record.

---

## 5. Business Logic (the money engine)

### 5.1 Merchant onboarding & auto-credential generation
| ID | Rule |
|---|---|
| ONB-1 | Public applicant submits onboarding form (Merchant info → Account/Admin info → Submit). Merchant created with `status=PENDING`. |
| ONB-2 | Applicant sees: "We have received your merchant onboarding application. Our team will review your application and contact you within 24–48 hours." |
| ONB-3 | Compliance reviews → sets `APPROVED` or `REJECTED`. Action is audit-logged. |
| ONB-4 | On approval, admin creates one or more Accounts. **For each account, the system auto-generates a SANDBOX and a LIVE credential pair** (api_key + secret). |
| ONB-5 | Secret plaintext is displayed to admin/merchant **exactly once**; only the hash is stored (NN-7). |
| ONB-6 | Account is created `operating_mode=SANDBOX`, `float_balance=0` (NN-10). |
| ONB-7 | Welcome email sent with account details + sandbox keys. |
| ONB-8 | Merchant tests in sandbox; admin promotes to `PRODUCTION` only deliberately. Promotion is audit-logged. |

### 5.2 Float management
| ID | Rule |
|---|---|
| FLOAT-1 | Float attaches to **Account**, not Merchant. Each account has its own balance & ledger. |
| FLOAT-2 | `addFloat` requires `FINANCE` (or `ADMIN`) role. Amount must be > 0. |
| FLOAT-3 | If amount > `DUAL_CONTROL_THRESHOLD` (configurable), a **second admin must approve** before the credit posts. |
| FLOAT-4 | Crediting float = one DB transaction: insert `float_ledger` CREDIT entry, recompute `balance_after`, write audit log. |
| FLOAT-5 | All float math is integer ngwee (NN-1). Balance is derived from the ledger (NN-2). |
| FLOAT-6 | When `float_balance < low_float_threshold`, fire alert to merchant + admin. |
| FLOAT-7 | Admin debit/adjustment of float follows the same ledger+audit path (no silent edits). |

### 5.3 Transaction processing
| ID | Rule |
|---|---|
| TXN-1 | On collection/disbursement: open DB transaction, `SELECT account FOR UPDATE` (row lock). |
| TXN-2 | Compute `required = amount + charge`. If `available_float < required` → `FAILED`, reason `INSUFFICIENT_FLOAT`. |
| TXN-3 | Else: debit float via ledger entry, set txn `PROCESSING`, dispatch to processor. |
| TXN-4 | All processing is idempotent on `(account_id, idempotency_key)` (NN-8 / §5.6). |
| TXN-5 | Sandbox-mode accounts use simulated processor responses; never call live MNO endpoints. |
| TXN-6 | A PRODUCTION transaction is rejected if the account is not in PRODUCTION mode or has zero float. |

### 5.4 Charge calculation
| ID | Rule |
|---|---|
| CHG-1 | `FIXED`: charge = `fixed_value`. |
| CHG-2 | `PERCENTAGE`: charge = `amount * percent_value / 100` (integer-safe rounding, document rounding rule: round half-up to nearest ngwee). |
| CHG-3 | `TIERED`: charge = `fixed_value + (amount * percent_value / 100)`. |
| CHG-4 | `SOURCE` fulfiller: customer debited `amount + charge`; merchant net = `amount`. |
| CHG-5 | `MERCHANT` fulfiller: customer debited `amount`; merchant net = `amount − charge`. |
| CHG-6 | `amount`, `charge`, `net_amount` are stored separately on the transaction for reporting. |

### 5.5 Transaction state machine
| ID | Rule |
|---|---|
| STATE-1 | Allowed transitions ONLY: `PENDING→PROCESSING`, `PROCESSING→SUCCESS`, `PROCESSING→FAILED`, `PENDING→EXPIRED`, `SUCCESS→REVERSED`. |
| STATE-2 | No other transition is permitted. Reject illegal transitions. |
| STATE-3 | `REVERSED` writes a NEW compensating ledger entry crediting float back. The original transaction/ledger row is never edited. |
| STATE-4 | `EXPIRED` set when no processor response within timeout (configurable). |
| STATE-5 | Every state change is audit-logged with actor and reason. |

### 5.6 Idempotency
| ID | Rule |
|---|---|
| IDEM-1 | Every mutating API request requires an `Idempotency-Key` header. |
| IDEM-2 | If the key was already processed for that account, return the **original** stored response; do not reprocess. |
| IDEM-3 | Idempotency records stored in Redis and/or `transactions` unique constraint. TTL configurable (≥ 24h). |

### 5.7 Webhooks / callbacks
| ID | Rule |
|---|---|
| WH-1 | On a transaction reaching a final state, POST a signed payload to `account_settings.callback_url`. |
| WH-2 | Sign payload with HMAC using `webhook_signing_secret` so merchants can verify authenticity. |
| WH-3 | Delivery is async (Redis queue), never blocks the transaction. |
| WH-4 | On non-2xx: retry with backoff `1m, 5m, 30m, 2h, 6h`, then `GIVEN_UP` + flag for manual. |
| WH-5 | Every attempt recorded in `webhook_deliveries`. |

### 5.8 Settlements
| ID | Rule |
|---|---|
| SET-1 | Scheduled run computes settleable balance per account = successful collections − charges − already settled. |
| SET-2 | Creates `Settlement` (`PENDING`), on bank confirmation → `SETTLED`, on failure → `FAILED` (funds retained, flagged). |
| SET-3 | Every settlement writes a ledger entry. |

### 5.9 Reconciliation
| ID | Rule |
|---|---|
| REC-1 | Daily: ingest processor (MTN/Airtel/Zamtel) settlement report. |
| REC-2 | Compare each transaction's internal status vs processor status. |
| REC-3 | Mismatch → flag `DISPUTED` for manual review. |
| REC-4 | Produce reconciliation report (matched / unmatched / disputed). |

---

## 6. Portal & Module Specifications

### 6.1 Admin Portal (`admin.instacompayzm.com`, :8010)
Login: email + password → **email OTP** → dashboard. (Email OTP only for v1, per user decision.)

Sidebar modules:
1. **Dashboard** — filters (All Merchants dropdown [Public/Private], Merchant Account dropdown, Start/End date, Reset Filter). Summary: Total Collections (ZMW value), Total Volume (count), Success Rate (%). Charts: Total Collections trend (line), Distribution by Processor (pie/donut), Distribution by Status (pie).
2. **Merchants** — listing (name, type, registration date, action). Create Merchant flow (name, type, contact email/phone, admin super-user details). Then create Account(s) (select account type: Collection/Disbursement/OVA/Bank). Account page columns: Merchant ID, Type, Status, Registration date, Actions (Configurations, Statement, Ledgers).
   - **Manage Account / Configurations screen:** Operating mode toggle (Sandbox/Production); Charge Configuration (Processor dropdown, Charge Fulfiller [Source/Merchant], Charge Type [Fixed/Percentage/Tiered], Enter Charge); Callback URL (enter + save); IP Whitelist (enter + save); Add Payment Processor (MTN/Airtel/Zamtel/etc, save); configured OVA charge config displayed back.
3. **Transactions** — global ledger, filters, detail, authorized reversal.
4. **Settlements** — settlement table (ID, Merchant, Amount, Bank, Status, Date), filters.
5. **Reports** — report table (Name, Start, End, Status, Date), "+ Create Report", CSV/Excel export.
6. **Security** — see §7 (sessions, audit log views, IP controls).
7. **Float Management** — credit/debit float, per-account ledger view, thresholds, dual-control approvals.
8. **Notifications** — system & merchant alerts.
9. **User Management** — add user (name, phone, email, system/merchant, role), verification status, permissions, roles (Admin/Auditor/Finance/Reconciliation/Compliance + add custom), assign role.
10. **Configurations** — processors, currencies (ZMW), templates, modes.

### 6.2 Business (Merchant) Portal (`merchants.instacompayzm.com`, :8020)
Public landing within portal: logo (left), Home/Contact/Documentation (middle), Sign in / Getting Started (right). Contact shows company address. Hero copy: "Seamless Payment Solutions for Zambian Merchants" etc. Processor icons: MTN, Airtel, Zamtel, Zed Mobile, Visa. Getting Started → onboarding form (§5.1).

Login: email + password → **email OTP** → dashboard.

Sidebar modules:
1. **Dashboard** — summary metrics (Total Collections ZMW, Total Transactions, Success Rate), Collections Volume Trend (Daily/Weekly/Monthly), Distribution by Processor (donut), Distribution by Status, global filters (account, date range). **All scoped to this merchant only (NN-6).**
2. **Accounts** — this merchant's accounts, IDs (e.g. CA0000024), Sandbox/Live status, registration date, quick actions.
3. **Transactions** — collections/transaction history; customer search by MSISDN; reference filters; payment-method filter; columns: Transaction ID, Collection Reference, Amount, Charge, Processor Status.
4. **Settlements** — settlement history, bank details, status.
5. **Reports** — self-service report generation, CSV/Excel export, date ranges.
6. **User Management** — sub-users under the merchant, roles.
7. **API Documentation** — integration docs (auth, signing, endpoints, webhooks, errors). View own keys, regenerate, manage webhook URL + IP whitelist.

### 6.3 Landing Page (`instacompayzm.com`, :8040)
Public marketing site. No DB write access; ideally read-only or no DB user. "Bank of Zambia Licensed" claim gated on LEGAL-1.

---

## 7. Security Specification & Audit

> This section is a hard gate. Claude Code must implement AND self-audit against every control here. The **Security Audit Checklist** (§7.9) must pass before any production deploy.

### 7.1 Authentication & sessions
| ID | Control |
|---|---|
| SEC-A1 | Email + password login, then **email OTP** (v1) for both portals. OTP: 6 digits, single-use, expires ≤ 5 min, rate-limited, invalidated after use. |
| SEC-A2 | Passwords hashed with argon2id (or bcrypt cost ≥ 12). Never stored or logged in plaintext. |
| SEC-A3 | Session tokens: short-lived access token (≤ 15 min) + rotating refresh token. Tokens are httpOnly, Secure, SameSite. |
| SEC-A4 | Admin and merchant auth are **separate** systems/realms; no shared sessions across portals. |
| SEC-A5 | Login throttling + lockout after N failed attempts; OTP request rate-limited. |
| SEC-A6 | Logout invalidates refresh token server-side. |

### 7.2 Authorization (RBAC)
| ID | Control |
|---|---|
| SEC-Z1 | Every endpoint enforces role/permission **server-side**. UI hiding is not security. |
| SEC-Z2 | Merchant queries are scoped to the authenticated merchant's `account_id`(s) at the data layer (NN-6). Attempting cross-merchant access returns 403/404, never data. |
| SEC-Z3 | Float credit, mode change, credential generation, merchant approval require elevated roles (Finance/Admin/Compliance as applicable). |
| SEC-Z4 | Dual control on float credits above threshold (FLOAT-3). |

### 7.3 API & credential security
| ID | Control |
|---|---|
| SEC-API1 | API secrets stored as hash only (NN-7); plaintext shown once. |
| SEC-API2 | Incoming API requests authenticated via api_key + **HMAC request signature** over payload + timestamp. |
| SEC-API3 | Reject requests with stale timestamp (replay window ≤ 5 min) or invalid signature. |
| SEC-API4 | Live keys honor per-account **IP whitelist**. |
| SEC-API5 | Separate sandbox vs live key pairs; sandbox cannot move real money. |
| SEC-API6 | Per-account and per-IP rate limiting + velocity rules (Redis). |
| SEC-API7 | Key rotation/revocation supported; revoked keys rejected immediately. |

### 7.4 Data protection
| ID | Control |
|---|---|
| SEC-D1 | TLS everywhere (HTTPS only), HSTS enabled, HTTP→HTTPS redirect. |
| SEC-D2 | Sensitive fields at rest (bank details, KYC docs, secrets) encrypted; secrets via env/secret store, never in code or Git. |
| SEC-D3 | Parameterized queries only (no string-concatenated SQL). |
| SEC-D4 | Input validation + output encoding (block SQLi/XSS). Strict Content-Security-Policy on portals. |
| SEC-D5 | PostgreSQL bound to internal Docker network only; never on the public firewall. |
| SEC-D6 | Redis bound to internal network only; password-protected. |
| SEC-D7 | Per-app DB roles with least privilege: landing has minimal/no DB access; api/portals have only the grants they need. |

### 7.5 Network & infrastructure
| ID | Control |
|---|---|
| SEC-N1 | Firewall: deny incoming by default; allow 80, 443; SSH restricted to admin IP/VPN. Do NOT publicly expose 8010/8020/8030/8040, 5432, 6379. |
| SEC-N2 | SSH: key-only, root login disabled, password auth disabled. |
| SEC-N3 | Admin portal access optionally IP-restricted at Nginx (office IP / VPN) given it controls money. |
| SEC-N4 | Nginx sets security headers: HSTS, X-Content-Type-Options, X-Frame-Options/frame-ancestors, Referrer-Policy, CSP. |
| SEC-N5 | Containers run as non-root users; minimal base images; no secrets baked into images. |
| SEC-N6 | Egress controls where feasible; only required outbound (processor APIs, SMTP) allowed. |

### 7.6 Auditability & monitoring
| ID | Control |
|---|---|
| SEC-AU1 | Append-only `audit_logs` for: login, OTP issue/verify, float credit/debit, credential generate/rotate/revoke, merchant approve/reject, mode change, role change, settlement, reversal (NN-9). |
| SEC-AU2 | Logs capture actor, action, target, IP, timestamp, before/after metadata. |
| SEC-AU3 | Application + access logs centralized; no secrets/PII/card data in logs. |
| SEC-AU4 | Alerting on anomalies: repeated failed logins, float credits, key generation spikes, reconciliation mismatches. |

### 7.7 Money-integrity controls
| ID | Control |
|---|---|
| SEC-M1 | Integer ngwee only (NN-1); a linter/test forbids float types on money fields. |
| SEC-M2 | All balance changes via append-only double-entry ledger (NN-2). |
| SEC-M3 | Row-level locking on float spend (TXN-1) to prevent race/double-spend. |
| SEC-M4 | Idempotency on all mutating endpoints (IDEM-1..3). |
| SEC-M5 | Reconciliation job detects ledger vs processor drift (REC-1..4). |
| SEC-M6 | Reversals are compensating entries, never edits (STATE-3). |

### 7.8 Backups & recovery
| ID | Control |
|---|---|
| SEC-B1 | Automated `pg_dump` on schedule, copied off-server. |
| SEC-B2 | Backups encrypted; restore tested regularly (a backup you cannot restore is not a backup). |
| SEC-B3 | Documented restore + rebuild runbook; secrets kept in a password manager, not plaintext files. |
| SEC-B4 | DB backup taken before every production deploy/migration. |

### 7.9 Security Audit Checklist (must all pass before production)
- [ ] No floating-point anywhere on monetary values (grep/lint clean).
- [ ] All balance changes go through `float_ledger`; no direct balance writes in code.
- [ ] Merchant data access provably scoped to `account_id`; cross-tenant test returns no data.
- [ ] API secrets hashed; plaintext never logged or retrievable.
- [ ] HMAC signature + timestamp replay protection verified on API.
- [ ] Idempotency enforced on all mutating endpoints (tested with duplicate key).
- [ ] Row lock on float spend verified under concurrent load test.
- [ ] OTP single-use, expiring, rate-limited; password hashing argon2id/bcrypt.
- [ ] RBAC enforced server-side on every endpoint (no UI-only gating).
- [ ] Dual control on large float credits verified.
- [ ] TLS + HSTS + security headers present; HTTP redirects to HTTPS.
- [ ] Postgres & Redis NOT reachable from public internet; firewall verified.
- [ ] SSH key-only, root disabled; app ports not publicly exposed.
- [ ] Containers run non-root; no secrets in images or Git history.
- [ ] Append-only audit logs populated for all sensitive actions.
- [ ] Webhooks signed; retries with backoff; deliveries recorded.
- [ ] Reconciliation job runs and flags mismatches.
- [ ] Automated encrypted backups + tested restore + pre-deploy backup.
- [ ] Separate dev/prod databases and secrets; no dev secret works in prod.
- [ ] Currency is ZMW throughout; no UGX/other artifacts remain.

---

## 8. API Surface (v1, on `api.instacompayzm.com`)

All endpoints under `/v1/`. Auth via api_key + HMAC signature (SEC-API2). All mutating calls require `Idempotency-Key`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/collections` | Initiate a collection (customer → merchant) |
| GET | `/v1/transactions/{id}` | Check transaction status |
| POST | `/v1/disbursements` | Initiate a disbursement (if enabled) |
| POST | `/v1/transactions/{id}/reverse` | Reverse a successful transaction |
| GET | `/v1/accounts/{id}/balance` | Float/balance enquiry |
| GET | `/v1/settlements` | List settlements |

Each endpoint documents: method+path, params/types, sample request, sample success, full error list. Error codes include: `INSUFFICIENT_FLOAT`, `INVALID_SIGNATURE`, `DUPLICATE_REQUEST` (idempotency), `IP_NOT_WHITELISTED`, `ACCOUNT_NOT_LIVE`, `VALIDATION_ERROR`. Provide an **OpenAPI 3.x spec** as the single source of truth; render with Redoc/Swagger; ship cURL/Node/PHP samples + Postman collection. Webhooks documented with event types, signed payload schema, verification, retry policy.

---

## 9. Docker & Deployment

### 9.1 Containers (docker-compose)
- `ic-nginx` (80/443) — reverse proxy, TLS, headers.
- `ic-admin` (8010), `ic-merchant` (8020), `ic-api` (8030), `ic-landing` (8040).
- `ic-postgres` (5432, internal), `ic-redis` (6379, internal).
- Internal Docker network; only `ic-nginx` publishes public ports. App ports bound to host per firewall allowance but proxied, not public-facing.

### 9.2 Rules
| ID | Rule |
|---|---|
| DEP-1 | One service per container; `restart: unless-stopped`. |
| DEP-2 | Secrets via env files / Docker secrets, never committed; `.env` git-ignored. |
| DEP-3 | Images run as non-root, minimal base, multi-stage builds, no secrets in layers. |
| DEP-4 | DB migrations run as an explicit deploy step, never destructive-on-boot. |
| DEP-5 | Healthchecks on every container. |
| DEP-6 | Transport via private Git repo: build on dev (`76.13.57.29`), promote to prod (`102.23.120.234`) by pull + migrate + restart. |
| DEP-7 | Pre-deploy DB backup (SEC-B4). |
| DEP-8 | Dev runs sandbox processors + seeded data; prod uses live secrets. |

### 9.3 Email (OTP + notifications)
- Authenticated SMTP (Hostinger) for `noreply@`, `admin@`, `security@` `instacompayzm.com`.
- Configure SPF, DKIM, DMARC DNS records so OTP/reset/alert emails deliver.
- OTP emails: no sensitive data beyond the code; codes expire and are single-use.

---

## 10. DNS & TLS

### 10.1 DNS records (Cloudflare)
Domain registrar/DNS: Cloudflare. Dev currently points all app records at the dev box.

| Name | Type | Content (dev) | Proxy |
|---|---|---|---|
| `instacompayzm.com` | A | `76.13.57.29` | **DNS only** |
| `www` | CNAME | `instacompayzm.com` | DNS only (recommended) |
| `admin` | A | `76.13.57.29` | **DNS only** |
| `merchants` | A | `76.13.57.29` | **DNS only** |
| `api` | A | `76.13.57.29` | **DNS only** |
| mail records (autoconfig, autodiscover, 3× DKIM `_domainkey`, 2× MX, SPF TXT, DMARC TXT) | as provided by Hostinger | — | mail = DNS only |

| ID | Rule |
|---|---|
| DNS-1 | App records (apex, www, admin, merchants, api) are **DNS only (unproxied)** during development. Proxying breaks Certbot HTTP-01 and masks real client IPs (needed for SEC-API4 IP whitelist and SEC-AU2 audit IPs). |
| DNS-2 | If Cloudflare proxy is enabled later in production, switch Certbot to the DNS-01 challenge and read `CF-Connecting-IP` for the true client IP everywhere IPs are used (whitelist, audit, rate limiting). |
| DNS-3 | Never proxy MX/mail records. |
| DNS-4 | DMARC starts at `p=none` (monitor). After confirming OTP/notification email deliverability, tighten to `p=quarantine`, then `p=reject`, to prevent spoofing of `admin@`/`security@`. |
| DNS-5 | At production cutover, either re-point these records to `102.23.120.234`, OR use `dev.` hostnames for dev and bare hostnames for prod so both environments can run simultaneously (preferred). |

### 10.2 TLS (Let's Encrypt / Certbot)
Issue certificates on the box once DNS resolves to it and records are DNS-only:

```bash
sudo certbot --nginx \
  -d instacompayzm.com -d www.instacompayzm.com \
  -d admin.instacompayzm.com -d merchants.instacompayzm.com \
  -d api.instacompayzm.com
```

| ID | Rule |
|---|---|
| TLS-1 | Certbot installs a systemd timer for auto-renewal; verify with `sudo certbot renew --dry-run`. |
| TLS-2 | Force HTTPS redirect and enable HSTS in Nginx (SEC-D1, SEC-N4). |
| TLS-3 | Certs cover all five hostnames; renew before expiry. |

---

## 11. Legal & Compliance

| ID | Item |
|---|---|
| LEGAL-1 | Do NOT display "Bank of Zambia Licensed" until BoZ authorization is confirmed to apply. Running a payment gateway in Zambia is regulated. Confirm with BoZ and legal counsel. (Not legal advice.) |
| LEGAL-2 | If raw card PANs are ever stored/transmitted, PCI DSS scope applies — prefer tokenization via an upstream processor so PANs never touch your servers. Decide scope before building card flows. |
| LEGAL-3 | KYC/AML: store merchant KYC, support compliance review, flag suspicious velocity, retain records per regulation. |

---

## 12. Validation Checklist (milestone gate)

Claude Code: before declaring a milestone complete, confirm each item and cite the requirement IDs satisfied.

**Architecture**
- [ ] Four services containerized on 8010/8020/8030/8040, one shared Postgres, Redis present.
- [ ] Only Nginx public; DB/Redis internal-only; firewall matches §7.5.
- [ ] Dev/prod separation with separate DBs and secrets.

**Data & money engine**
- [ ] Schema matches §4; ledger and audit tables append-only.
- [ ] Integer ngwee everywhere; ZMW only.
- [ ] Float credit path = ledger + audit + dual-control threshold.
- [ ] Transaction path = row lock + float check + idempotency.
- [ ] State machine enforces only allowed transitions; reversals are compensating entries.
- [ ] Charge calc handles Fixed/Percentage/Tiered × Source/Merchant correctly.
- [ ] Webhooks signed + retried + recorded.
- [ ] Settlement + reconciliation jobs implemented.

**Auto-credentials & onboarding**
- [ ] Onboarding flow (PENDING→APPROVED) implemented.
- [ ] On approval, sandbox+live credentials auto-generated; secret shown once; hash stored.
- [ ] New accounts start SANDBOX, zero float; promotion is deliberate + audited.

**Portals**
- [ ] Admin modules (§6.1) present incl. charge-config screen.
- [ ] Merchant modules (§6.2) present; all data scoped to merchant.
- [ ] Landing page (§6.3); BoZ claim gated.

**Security**
- [ ] Entire §7.9 Security Audit Checklist passes.

**Ops**
- [ ] Backups automated + restore tested; pre-deploy backup in place.
- [ ] SMTP + SPF/DKIM/DMARC configured; OTP emails deliver.
- [ ] OpenAPI spec + docs published on API.

---

*End of specification. Claude Code: re-read the relevant section before implementing each feature, and validate against the requirement IDs and checklists above when reporting completion.*

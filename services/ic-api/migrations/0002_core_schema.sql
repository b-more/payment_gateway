-- 0002_core_schema.sql
-- Core data model (§4). All money is BIGINT (integer ngwee, NN-1). All IDs are
-- UUID (gen_random_uuid from pgcrypto, enabled in 0001). Mutable tables carry
-- created_at/updated_at; float_ledger and audit_logs are APPEND-ONLY and are
-- enforced as such AT THE DATABASE LEVEL below (NN-2, NN-9, SEC-M2).

-- ─────────────────────────────────────────────────────────────────────────────
-- Shared trigger functions
-- ─────────────────────────────────────────────────────────────────────────────

-- Maintains updated_at on mutable tables.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Hard stop for any UPDATE/DELETE/TRUNCATE on append-only tables. This fires for
-- every role including the table owner, so it holds even before per-app
-- least-privilege DB roles exist (SEC-D7). Corrections are new compensating
-- rows, never edits (STATE-3).
CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only: % is not permitted (NN-2/NN-9/SEC-M2)',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- Enum types
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE merchant_type           AS ENUM ('PUBLIC', 'PRIVATE');
CREATE TYPE merchant_status         AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE kyc_status              AS ENUM ('UNVERIFIED', 'VERIFIED', 'FAILED');
CREATE TYPE account_type            AS ENUM ('COLLECTION', 'DISBURSEMENT', 'OVA', 'BANK');
CREATE TYPE operating_mode          AS ENUM ('SANDBOX', 'PRODUCTION');
CREATE TYPE account_status          AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE credential_environment  AS ENUM ('SANDBOX', 'LIVE');
CREATE TYPE credential_status       AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE processor               AS ENUM ('MTN', 'AIRTEL', 'ZAMTEL', 'ZED_MOBILE', 'VISA');
CREATE TYPE charge_fulfiller        AS ENUM ('SOURCE', 'MERCHANT');
CREATE TYPE charge_type             AS ENUM ('FIXED', 'PERCENTAGE', 'TIERED');
CREATE TYPE ledger_entry_type       AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE transaction_type        AS ENUM ('COLLECTION', 'DISBURSEMENT');
CREATE TYPE transaction_status      AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REVERSED', 'EXPIRED');
CREATE TYPE settlement_status       AS ENUM ('PENDING', 'SETTLED', 'FAILED');
CREATE TYPE webhook_status          AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'GIVEN_UP');
CREATE TYPE user_scope              AS ENUM ('SYSTEM', 'MERCHANT');
CREATE TYPE user_status             AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.1 merchants
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE merchants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  merchant_type merchant_type NOT NULL,
  email         text NOT NULL,
  phone         text,
  status        merchant_status NOT NULL DEFAULT 'PENDING',  -- ONB-1
  kyc_status    kyc_status NOT NULL DEFAULT 'UNVERIFIED',
  registered_at timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.2 accounts  (NN-10: start SANDBOX with zero float)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id         uuid NOT NULL REFERENCES merchants(id),
  account_type        account_type NOT NULL,
  operating_mode      operating_mode NOT NULL DEFAULT 'SANDBOX',          -- NN-10
  float_balance       bigint NOT NULL DEFAULT 0 CHECK (float_balance >= 0), -- ngwee; derived from ledger (NN-2)
  low_float_threshold bigint NOT NULL DEFAULT 0 CHECK (low_float_threshold >= 0),
  status              account_status NOT NULL DEFAULT 'ACTIVE',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_accounts_merchant ON accounts(merchant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.3 api_credentials  (NN-7: secret stored hashed only)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE api_credentials (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id),
  environment     credential_environment NOT NULL,
  api_key         text NOT NULL UNIQUE,
  secret_hash     text NOT NULL,                       -- HASH only (NN-7); plaintext never stored
  status          credential_status NOT NULL DEFAULT 'ACTIVE',
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_rotated_at timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_credentials_account ON api_credentials(account_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.4 charge_configs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE charge_configs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES accounts(id),
  processor        processor NOT NULL,
  charge_fulfiller charge_fulfiller NOT NULL,
  charge_type      charge_type NOT NULL,
  fixed_value      bigint CHECK (fixed_value IS NULL OR fixed_value >= 0),   -- ngwee (FIXED / TIERED)
  percent_value    numeric(5,2) CHECK (percent_value IS NULL OR percent_value >= 0), -- percent (PERCENTAGE / TIERED)
  ova_account_ref  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_charge_configs_account ON charge_configs(account_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.5 account_settings  (one row per account)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE account_settings (
  account_id             uuid PRIMARY KEY REFERENCES accounts(id),
  callback_url           text,
  webhook_signing_secret text,
  ip_whitelist           text[] NOT NULL DEFAULT '{}',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.6 float_ledger  (APPEND-ONLY, double-entry)  NN-2
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE float_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL REFERENCES accounts(id),
  entry_type    ledger_entry_type NOT NULL,
  amount        bigint NOT NULL CHECK (amount > 0),         -- ngwee, always positive
  balance_after bigint NOT NULL CHECK (balance_after >= 0), -- running snapshot
  reference     text,
  counterparty  text,
  created_by    uuid,                                       -- admin or system actor
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_float_ledger_account_time ON float_ledger(account_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.7 transactions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE transactions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           uuid NOT NULL REFERENCES accounts(id),
  type                 transaction_type NOT NULL,
  processor            processor NOT NULL,
  msisdn               text,
  amount               bigint NOT NULL CHECK (amount >= 0),     -- ngwee
  charge               bigint NOT NULL DEFAULT 0 CHECK (charge >= 0),
  net_amount           bigint NOT NULL CHECK (net_amount >= 0),
  status               transaction_status NOT NULL DEFAULT 'PENDING',
  failure_reason       text,
  idempotency_key      text NOT NULL,
  collection_reference text,
  environment          operating_mode NOT NULL DEFAULT 'SANDBOX',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_transactions_idempotency UNIQUE (account_id, idempotency_key) -- IDEM-3
);
CREATE INDEX idx_transactions_account_time ON transactions(account_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.8 settlements
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE settlements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id),
  amount       bigint NOT NULL CHECK (amount >= 0),  -- ngwee
  bank_details jsonb,
  status       settlement_status NOT NULL DEFAULT 'PENDING',
  settled_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_settlements_account ON settlements(account_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.9 webhook_deliveries
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE webhook_deliveries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transactions(id),
  url            text NOT NULL,
  attempt        int NOT NULL DEFAULT 0,
  response_code  int,
  status         webhook_status NOT NULL DEFAULT 'PENDING',
  next_retry_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_deliveries_txn ON webhook_deliveries(transaction_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.10 users & roles (RBAC)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope          user_scope NOT NULL,
  merchant_id    uuid REFERENCES merchants(id),   -- set when scope = MERCHANT
  name           text NOT NULL,
  email          text NOT NULL,                   -- login username
  phone          text,
  status         user_status NOT NULL DEFAULT 'INVITED',
  email_verified boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_users_scope_email UNIQUE (scope, email),  -- separate realms (SEC-A4)
  CONSTRAINT chk_users_merchant_scope CHECK (
    (scope = 'MERCHANT' AND merchant_id IS NOT NULL) OR
    (scope = 'SYSTEM'   AND merchant_id IS NULL)
  )
);
CREATE INDEX idx_users_merchant ON users(merchant_id);

CREATE TABLE roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  is_custom   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     uuid NOT NULL REFERENCES roles(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

-- Standard roles named in §4.10 (reference data; custom roles added later).
INSERT INTO roles (name, description) VALUES
  ('ADMIN',          'Full system administration'),
  ('AUDITOR',        'Read-only access to audit and reports'),
  ('FINANCE',        'Float credit/debit and settlements'),
  ('RECONCILIATION', 'Reconciliation review and dispute handling'),
  ('COMPLIANCE',     'Merchant approval and KYC/AML review');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.11 audit_logs  (APPEND-ONLY, forensic record)  NN-9
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid,                       -- who (admin/system; null for unauthenticated events)
  actor_scope user_scope,
  action      text NOT NULL,              -- FLOAT_CREDIT, CREDENTIAL_GENERATED, MERCHANT_APPROVED, ...
  target      text,
  metadata    jsonb,                      -- before/after where relevant (SEC-AU2)
  ip_address  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_action_time ON audit_logs(action, created_at);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at triggers (mutable tables only)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_merchants_updated         BEFORE UPDATE ON merchants         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_accounts_updated          BEFORE UPDATE ON accounts          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_api_credentials_updated   BEFORE UPDATE ON api_credentials   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_charge_configs_updated    BEFORE UPDATE ON charge_configs    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_account_settings_updated  BEFORE UPDATE ON account_settings  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_transactions_updated      BEFORE UPDATE ON transactions      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_settlements_updated       BEFORE UPDATE ON settlements       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_webhook_deliveries_updated BEFORE UPDATE ON webhook_deliveries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated             BEFORE UPDATE ON users             FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_roles_updated             BEFORE UPDATE ON roles             FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- APPEND-ONLY enforcement at the database level (NN-2, NN-9, SEC-M2)
-- Primary guarantee: these triggers reject UPDATE/DELETE (row) and TRUNCATE
-- (statement) and fire for every role, including the table owner.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_float_ledger_no_mutation
  BEFORE UPDATE OR DELETE ON float_ledger
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER trg_float_ledger_no_truncate
  BEFORE TRUNCATE ON float_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();

CREATE TRIGGER trg_audit_logs_no_mutation
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER trg_audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();

-- Defense in depth for when the least-privilege app role exists (SEC-D7):
--   REVOKE UPDATE, DELETE, TRUNCATE ON float_ledger, audit_logs FROM <app_role>;
-- PUBLIC holds no privileges on these tables by default; revoke explicitly anyway.
REVOKE UPDATE, DELETE, TRUNCATE ON float_ledger FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs   FROM PUBLIC;

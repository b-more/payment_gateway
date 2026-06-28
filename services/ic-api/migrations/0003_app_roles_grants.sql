-- 0003_app_roles_grants.sql
-- Per-app least-privilege DB roles (SEC-D7, NN-4).
--
-- The migration/owner role (DATABASE_URL) keeps full DDL. These three login
-- roles get ONLY the grants each app needs. The landing site gets NO role at
-- all (§6.3). Roles are created here as NOLOGIN with no password; LOGIN and the
-- per-environment password are set out-of-band by the provisioning step
-- (src/db/provision-roles.ts) so secrets never enter version control (§2.2, DEP-2).

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ic_app_api')      THEN CREATE ROLE ic_app_api NOLOGIN;      END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ic_app_admin')    THEN CREATE ROLE ic_app_admin NOLOGIN;    END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ic_app_merchant') THEN CREATE ROLE ic_app_merchant NOLOGIN; END IF;
END $$;

-- App roles may use the schema but cannot create objects in it.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO ic_app_api, ic_app_admin, ic_app_merchant;

-- ── ic_app_api — the money engine / API surface ──
-- Reads config/credentials, writes transactions/settlements/webhooks, appends to
-- the ledger and audit log, updates account float-balance cache + txn state.
GRANT SELECT ON merchants, accounts, charge_configs, account_settings, api_credentials,
                transactions, settlements, webhook_deliveries, float_ledger, audit_logs
  TO ic_app_api;
GRANT INSERT ON transactions, settlements, webhook_deliveries, float_ledger, audit_logs
  TO ic_app_api;
GRANT UPDATE ON accounts, transactions, settlements, webhook_deliveries
  TO ic_app_api;

-- ── ic_app_admin — control plane ──
-- Manages merchants, accounts, credentials, charge config, users/roles; credits
-- float (append) and reads/writes the audit trail.
GRANT SELECT, INSERT, UPDATE ON merchants, accounts, api_credentials, charge_configs,
                account_settings, users, roles, user_roles,
                transactions, settlements, webhook_deliveries
  TO ic_app_admin;
GRANT SELECT, INSERT ON float_ledger, audit_logs TO ic_app_admin;  -- append-only: no UPDATE/DELETE
GRANT DELETE ON user_roles TO ic_app_admin;                        -- role unassignment

-- ── ic_app_merchant — read-mostly; rows scoped to its own data at the app layer (NN-6) ──
-- Views its accounts/transactions/settlements/keys; manages webhook + IP settings,
-- rotates its own keys, and manages its sub-users. NO access to audit_logs.
GRANT SELECT ON merchants, accounts, charge_configs, account_settings, api_credentials,
                transactions, settlements, webhook_deliveries, float_ledger,
                users, roles, user_roles
  TO ic_app_merchant;
GRANT INSERT, UPDATE ON account_settings, api_credentials, users TO ic_app_merchant;
GRANT INSERT, DELETE ON user_roles TO ic_app_merchant;             -- assign/unassign sub-user roles

-- ── Append-only defense in depth (NN-2, NN-9, SEC-M2) ──
-- None of the app roles were granted UPDATE/DELETE/TRUNCATE on these tables;
-- revoke explicitly so the intent is unmistakable and survives future grants.
REVOKE UPDATE, DELETE, TRUNCATE ON float_ledger, audit_logs
  FROM ic_app_api, ic_app_admin, ic_app_merchant;

-- Landing (ic-landing) intentionally has NO database role (§6.3).
--
-- New tables in later migrations get NO privileges by default — each migration
-- must GRANT explicitly to the roles that need them (least privilege; no blanket
-- ALTER DEFAULT PRIVILEGES).

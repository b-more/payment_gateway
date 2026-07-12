-- 0018_runtime_db_role.sql
-- SEC-D7 hardening: stop the app from connecting to Postgres as a superuser.
--
-- The runtime was using the owner role (superuser), which BYPASSES the
-- least-privilege grants and the append-only REVOKEs on float_ledger/audit_logs
-- from 0003. This introduces a single non-superuser login role, `ic_app`, that
-- inherits the three per-app roles — giving the app the union of exactly the
-- privileges it needs and nothing more. Migrations continue to run as the owner.

-- Gap found while validating coverage: merchant_documents (onboarding KYC) was
-- never granted to an app role — it only worked because the app was superuser.
-- Onboarding runs under the admin role.
GRANT SELECT, INSERT, UPDATE ON merchant_documents TO ic_app_admin;

-- Combined runtime role. Created NOLOGIN here; provision-roles.ts sets LOGIN +
-- password from the environment (secrets never enter git). INHERIT (default) so
-- it uses the union of the three roles' privileges — which crucially still
-- includes NO UPDATE/DELETE on the append-only tables.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ic_app') THEN
    CREATE ROLE ic_app NOLOGIN;
  END IF;
END $$;

GRANT ic_app_api, ic_app_admin, ic_app_merchant TO ic_app;

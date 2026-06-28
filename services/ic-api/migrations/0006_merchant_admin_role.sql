-- 0006_merchant_admin_role.sql
-- Seed the MERCHANT_ADMIN role assigned to a merchant's super-user at onboarding
-- (ONB-1/4). Onboarding/admin operations run under the admin role (ic_app_admin),
-- which already holds the grants on merchants/accounts/credentials/users —
-- no new grants are required here.
INSERT INTO roles (name, description)
VALUES ('MERCHANT_ADMIN', 'Merchant account owner / super-user')
ON CONFLICT (name) DO NOTHING;

-- 0017_merchant_roles.sql
-- Merchant-scope RBAC roles so a MERCHANT_ADMIN can staff their own account with
-- least privilege and split the maker-checker duties (SEC-Z4): an INITIATOR
-- requests payouts, a distinct APPROVER releases them. MERCHANT_ADMIN (0006) is
-- the owner/super-user and may do both (still bound by the distinct-approver
-- rule). VIEWER is read-only.
--
-- Reference data only; no new grants — ic_app_merchant already holds
-- INSERT/DELETE on user_roles and INSERT/UPDATE on users (0003).
INSERT INTO roles (name, description) VALUES
  ('MERCHANT_INITIATOR', 'Requests payouts and runs collections (maker)'),
  ('MERCHANT_APPROVER',  'Approves or rejects payout requests (checker)'),
  ('MERCHANT_VIEWER',    'Read-only access to the merchant portal')
ON CONFLICT (name) DO NOTHING;

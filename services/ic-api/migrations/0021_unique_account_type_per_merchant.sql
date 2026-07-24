-- 0021_unique_account_type_per_merchant.sql
-- One account of each type per merchant.
--
-- provisionAccount inserted a fresh account on every call, with no check for an
-- existing one, and nothing in the schema stopped it. A double-submit during
-- onboarding produced two COLLECTION accounts for the same merchant (seen once,
-- for the Ministry of Finance, since cleaned up).
--
-- A merchant legitimately holds different account TYPES (COLLECTION,
-- DISBURSEMENT, OVA, BANK), so the rule is uniqueness on (merchant_id,
-- account_type), not on merchant_id alone. This is the backstop that holds even
-- for the concurrent-double-click race the application check cannot win: one
-- request commits, the other hits this and fails cleanly.
--
-- Additive and non-destructive. Verified against live data: no existing
-- (merchant_id, account_type) has more than one row, so it applies with no
-- violations.

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_merchant_type
  ON accounts (merchant_id, account_type);

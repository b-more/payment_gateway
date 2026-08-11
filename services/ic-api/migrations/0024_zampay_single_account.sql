-- 0024_zampay_single_account.sql
-- ZamPay settlement must apply to exactly one merchant account (GSB). Two guards
-- already exist in code: the reconcile job only discovers collections on the
-- account number pinned in ZAMPAY_ACCOUNT_NUMBER, and settlement rows only ever
-- exist for discovered collections. This adds the structural backstop: at most
-- one account may carry zampay_settlement_enabled = true, so a second account
-- cannot be turned on even by mistake or a stray UPDATE.
--
-- The partial unique index on a constant expression allows only a single row
-- where the flag is true.

CREATE UNIQUE INDEX IF NOT EXISTS uq_zampay_single_enabled_account
  ON account_settings ((1))
  WHERE zampay_settlement_enabled = true;

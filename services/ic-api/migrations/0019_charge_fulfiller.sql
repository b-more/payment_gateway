-- 0019_charge_fulfiller.sql
-- Who bears the transaction fee, and what the payer was actually debited.
--
-- charge_fulfiller already existed per (account, processor) in charge_configs,
-- but two things were missing.
--
-- 1. transactions recorded `amount` (the principal) and `charge` (the fee), but
--    never the gross the payer was debited. Under SOURCE the customer owes
--    amount + charge, so without this column the figure the customer actually
--    paid could only be re-derived, and a refund had nothing authoritative to
--    pay back. total_amount is that figure, stored once at creation.
--
-- 2. The fee-bearer was an admin-only setting applied after approval. It is now
--    chosen by the merchant during onboarding, so it has to live on the
--    merchant record from the moment the application is submitted, before any
--    account exists to hang a charge_config off.
--
-- Backfill note: every existing row is a MERCHANT-equivalent collection in
-- practice (the dispatch bug meant SOURCE never actually charged the customer
-- extra), so total_amount = amount is the correct history for all of them.

-- ── 1. The gross the payer was debited ──────────────────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS total_amount bigint;

UPDATE transactions SET total_amount = amount WHERE total_amount IS NULL;

-- Deliberately still NULLable here. The running container predates this column,
-- so NOT NULL now would fail its inserts during the deploy window. Migration
-- 0020 enforces it once the new code is serving.

-- The only two legal shapes: the payer owes the principal (MERCHANT bears the
-- fee), or the principal plus the fee (SOURCE bears it). Nothing else.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_transactions_total_amount'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT chk_transactions_total_amount
      CHECK (total_amount IS NULL OR total_amount = amount OR total_amount = amount + charge);
  END IF;
END $$;

COMMENT ON COLUMN transactions.total_amount IS
  'Gross debited from the payer. SOURCE: amount + charge. MERCHANT: amount. Refunds pay back this figure, never amount.';

-- ── 2. The merchant's onboarding choice ─────────────────────────────────────
-- Defaults to MERCHANT: the merchant absorbs the fee unless they opt their
-- customers into paying it. That is the safer default, because it can never
-- surprise an end customer with a higher price than the merchant advertised.
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS charge_fulfiller charge_fulfiller NOT NULL DEFAULT 'MERCHANT';

COMMENT ON COLUMN merchants.charge_fulfiller IS
  'Chosen at onboarding: who bears the fee on collections. Seeds charge_configs when an account is provisioned. Applies to collections only; disbursement fees are always merchant-borne.';

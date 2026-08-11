-- 0025_zampay_immediate_callback.sql
-- ZamPay settlement callback is now an immediate PAYMENT confirmation, not a
-- post-bank-wire settlement. As soon as we have collected the funds, we send the
-- callback with OUR payment reference so GSB marks the transaction successful and
-- the customer can complete. There is no operator wire step and no wait for money
-- to reach the destination bank.
--
-- Flow collapses from NEW -> READY_TO_WIRE -> WIRED -> SETTLED to
-- NEW -> RESOLVED -> SETTLED (fully automatic in the reconcile job). The
-- READY_TO_WIRE / WIRED enum values remain but are unused.
--
-- The reference we send is no longer a bank wire reference, so the column is
-- renamed to reflect that it holds our payment reference. Table is empty in
-- production (feature is off), so the rename is safe.

ALTER TABLE zampay_settlements RENAME COLUMN bank_reference TO payment_reference;

COMMENT ON COLUMN zampay_settlements.payment_reference IS
  'Our payment reference sent to GSB as PaymentReferenceNumber (the InstacomPay transaction id).';

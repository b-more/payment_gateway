-- ZamPay settlements: an operator-entered bank batch reference.
--
-- When the settled funds are actually moved to the destination bank in a batch,
-- finance records the bank's batch reference here for reconciliation against the
-- bank statement. Free-text, nullable, set from the admin ZamPay monitor.
-- Existing table-level grants on zampay_settlements already cover the new column.

ALTER TABLE zampay_settlements ADD COLUMN IF NOT EXISTS bank_batch_reference text;

COMMENT ON COLUMN zampay_settlements.bank_batch_reference IS
  'Bank batch reference for the settlement payout, entered by finance for reconciliation.';

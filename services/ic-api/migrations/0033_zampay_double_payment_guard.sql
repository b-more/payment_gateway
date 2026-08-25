-- ZamPay double-payment guard.
--
-- Dedup was keyed on the transaction, not the invoice: two separate successful
-- collections referencing the SAME GSB invoice would each resolve and send a
-- settlement callback — paying GSB twice for one invoice. Enforce one LIVE
-- settlement per (invoice, destination bank account) across all transactions,
-- and add a terminal DUPLICATE status for the blocked one.

ALTER TYPE zampay_settlement_status ADD VALUE IF NOT EXISTS 'DUPLICATE';

-- A settlement that is not yet resolved (NEW) or that failed/duplicated does not
-- occupy the slot, so a genuine retry after a FAILED settlement is still allowed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_zampay_invoice_destination_live
  ON zampay_settlements (invoice_number, (destination ->> 'bankAccountNumber'))
  WHERE invoice_number IS NOT NULL
    AND destination IS NOT NULL
    AND status IN ('RESOLVED', 'SETTLED');

-- 0023_zampay_settlements.sql
-- ZamPay (GSB) Phase 2 — settlement orchestration.
--
-- For each successful collection we made on ZamPay's behalf, we read the ZamPay
-- invoice to learn the destination bank account, an operator wires the funds
-- (we have no automated bank rail), and the system sends a settlement callback.
-- One row per (collection, destination account): an invoice's services grouped
-- by destination, since the callback is destination-centric (serviceIds + one
-- account + a summed amount), not invoice-centric.

-- Which accounts' collections are ZamPay-orchestrated. Only GSB, for now.
ALTER TABLE account_settings
  ADD COLUMN IF NOT EXISTS zampay_settlement_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN account_settings.zampay_settlement_enabled IS
  'When true, a successful collection on this account triggers ZamPay settlement orchestration.';

-- NEW          just created from a resolved collection
-- RESOLVED     invoice read; destination + amount known
-- READY_TO_WIRE in the operator worklist, awaiting the bank wire
-- WIRED        operator wired the funds + entered the reference; callback pending
-- SETTLED      settlement callback acknowledged by ZamPay
-- FAILED       invoice read failed, or the callback exhausted its retries
-- INVOICE_PAID invoice came back already Paid (Flow A) — do not wire; flag
CREATE TYPE zampay_settlement_status AS ENUM
  ('NEW', 'RESOLVED', 'READY_TO_WIRE', 'WIRED', 'SETTLED', 'FAILED', 'INVOICE_PAID');

CREATE TABLE zampay_settlements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id      uuid NOT NULL REFERENCES transactions(id),  -- our collection
  account_id          uuid NOT NULL REFERENCES accounts(id),
  zampay_reference    text NOT NULL,          -- inbound ref (collection_reference)
  invoice_number      text,                   -- resolved
  transaction_number  text,                   -- resolved
  service_ids         text[] NOT NULL DEFAULT '{}',
  destination         jsonb,                  -- {bankAccountNumber,bicCode,sortCode,accountName,bankName}
  amount_ngwee        bigint NOT NULL CHECK (amount_ngwee >= 0),
  currency            text NOT NULL DEFAULT 'ZMW',
  status              zampay_settlement_status NOT NULL DEFAULT 'NEW',
  bank_reference      text,                   -- operator's wire ref (PaymentReferenceNumber)
  wired_by            uuid,                   -- operator who confirmed the wire
  wired_at            timestamptz,
  callback_status     text,                   -- PENDING | DELIVERED | GIVEN_UP
  callback_attempts   int NOT NULL DEFAULT 0,
  last_callback_at    timestamptz,
  settled_at          timestamptz,
  failure_reason      text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- One settlement instruction per (collection, destination account). The
-- destination is snapshotted in jsonb, so the uniqueness key is the account
-- number within a transaction.
CREATE UNIQUE INDEX uq_zampay_settlement_txn_dest
  ON zampay_settlements (transaction_id, (destination->>'bankAccountNumber'));
CREATE INDEX idx_zampay_settlements_status ON zampay_settlements (status);
CREATE INDEX idx_zampay_settlements_account ON zampay_settlements (account_id);

CREATE TRIGGER trg_zampay_settlements_updated
  BEFORE UPDATE ON zampay_settlements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Grants (mirrors 0003). The orchestration worker (engine/API role) creates and
-- updates rows; the admin control plane reads them and records the operator's
-- wire confirmation.
GRANT SELECT, INSERT, UPDATE ON zampay_settlements TO ic_app_api;
GRANT SELECT, INSERT, UPDATE ON zampay_settlements TO ic_app_admin;

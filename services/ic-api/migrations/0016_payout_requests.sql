-- Maker-checker approval for merchant payouts (SEC-Z4). A merchant admin (maker)
-- requests a payout; a DIFFERENT merchant admin (checker) approves it, which then
-- creates + dispatches the disbursement transaction. Mirrors float_credit_requests.

CREATE TYPE payout_request_status AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE payout_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES accounts(id),
  merchant_id    uuid NOT NULL REFERENCES merchants(id),
  processor      processor NOT NULL,
  amount_ngwee   bigint NOT NULL CHECK (amount_ngwee > 0),
  msisdn         text NOT NULL,
  reference      text,
  status         payout_request_status NOT NULL DEFAULT 'PENDING_APPROVAL',
  requested_by   uuid NOT NULL,
  approved_by    uuid,                                   -- checker (approve/reject)
  reason         text,                                   -- rejection reason
  transaction_id uuid REFERENCES transactions(id),       -- the dispatched disbursement
  decided_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- The approver must differ from the requester (SEC-Z4). Enforced in code AND here.
  CONSTRAINT chk_payout_distinct_approver CHECK (approved_by IS NULL OR approved_by <> requested_by)
);
CREATE INDEX idx_payout_requests_merchant ON payout_requests(merchant_id, status);

CREATE TRIGGER trg_payout_requests_updated
  BEFORE UPDATE ON payout_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

GRANT SELECT, INSERT, UPDATE ON payout_requests TO ic_app_merchant, ic_app_admin;

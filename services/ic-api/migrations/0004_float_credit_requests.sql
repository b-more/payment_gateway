-- 0004_float_credit_requests.sql
-- Dual control for large float credits (FLOAT-3, SEC-Z4). Credits above
-- DUAL_CONTROL_THRESHOLD are parked here PENDING_APPROVAL until a SECOND admin
-- approves; only then is the float_ledger CREDIT posted (the approval path runs
-- the normal ledger+audit flow, FLOAT-4).

CREATE TYPE float_request_status AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

CREATE TABLE float_credit_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id),
  amount          bigint NOT NULL CHECK (amount > 0),   -- ngwee
  requested_by    uuid NOT NULL,
  status          float_request_status NOT NULL DEFAULT 'PENDING_APPROVAL',
  approved_by     uuid,
  reason          text,
  ledger_entry_id uuid REFERENCES float_ledger(id),
  decided_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- The approver must differ from the requester (SEC-Z4). Enforced in code AND here.
  CONSTRAINT chk_float_req_distinct_approver CHECK (approved_by IS NULL OR approved_by <> requested_by)
);
CREATE INDEX idx_float_credit_requests_account ON float_credit_requests(account_id);
CREATE INDEX idx_float_credit_requests_status  ON float_credit_requests(status);

CREATE TRIGGER trg_float_credit_requests_updated
  BEFORE UPDATE ON float_credit_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Dual control is an admin-side action (FLOAT-2/3): grant to the admin role only (SEC-D7).
GRANT SELECT, INSERT, UPDATE ON float_credit_requests TO ic_app_admin;

-- 0007_reconciliation.sql
-- Reconciliation results (§5.9). A run compares each processor-report entry to the
-- internal transaction status; mismatches are flagged DISPUTED for manual review
-- (REC-3) — note DISPUTED is NOT a transaction status, so it lives here rather
-- than mutating transactions (which would violate the §5.5 state machine).
-- (The settlements table already exists from 0002.)

CREATE TYPE reconciliation_result AS ENUM ('MATCHED', 'DISPUTED', 'UNMATCHED');

CREATE TABLE reconciliation_runs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processor  processor NOT NULL,
  matched    int NOT NULL DEFAULT 0,
  disputed   int NOT NULL DEFAULT 0,
  unmatched  int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reconciliation_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL REFERENCES reconciliation_runs(id),
  transaction_id     uuid REFERENCES transactions(id),   -- null when UNMATCHED
  processor_reference text,
  internal_status    transaction_status,                 -- null when UNMATCHED
  processor_status   text NOT NULL,
  result             reconciliation_result NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_recon_items_run    ON reconciliation_items(run_id);
CREATE INDEX idx_recon_items_result ON reconciliation_items(result);

-- Reconciliation + settlement are control-plane jobs (admin / RECONCILIATION),
-- run under the admin DB role (SEC-D7).
GRANT SELECT, INSERT, UPDATE ON reconciliation_runs  TO ic_app_admin;
GRANT SELECT, INSERT         ON reconciliation_items TO ic_app_admin;

-- 0010_reports.sql
-- Self-service reports (§6.1.5, §6.2.5). A report records a type + date range;
-- the CSV is regenerated on download. merchant_id NULL = a system/admin report;
-- set = a merchant-scoped report (NN-6).

CREATE TYPE report_type AS ENUM ('TRANSACTIONS', 'SETTLEMENTS');
CREATE TYPE report_status AS ENUM ('PENDING', 'READY', 'FAILED');

CREATE TABLE reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id  uuid REFERENCES merchants(id),
  report_type  report_type NOT NULL,
  name         text NOT NULL,
  period_start date NOT NULL,
  period_end   date NOT NULL,
  status       report_status NOT NULL DEFAULT 'READY',
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_merchant ON reports(merchant_id);

GRANT SELECT, INSERT ON reports TO ic_app_admin, ic_app_merchant;

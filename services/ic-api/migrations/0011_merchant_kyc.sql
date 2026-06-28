-- 0011 — Merchant KYC: business details on the merchant record, and an uploaded
-- documents table so compliance can review real artifacts before approving (ONB-3).
-- Documents are stored as bytea in Postgres (covered by encrypted backups, SEC-B),
-- served only through the admin-authenticated download endpoint.

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS trading_name        text,
  ADD COLUMN IF NOT EXISTS registration_number text,   -- PACRA business reg. no.
  ADD COLUMN IF NOT EXISTS tpin                text,   -- ZRA tax number
  ADD COLUMN IF NOT EXISTS address             text,
  ADD COLUMN IF NOT EXISTS city                text,
  ADD COLUMN IF NOT EXISTS website             text,
  ADD COLUMN IF NOT EXISTS description         text,
  ADD COLUMN IF NOT EXISTS review_reason       text;   -- shown on the review page

CREATE TABLE IF NOT EXISTS merchant_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id  uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  doc_type     text NOT NULL,                 -- CERTIFICATE_OF_INCORPORATION, TAX_CLEARANCE, …
  file_name    text NOT NULL,
  content_type text NOT NULL,
  byte_size    integer NOT NULL,
  content      bytea NOT NULL,                -- the file bytes
  status       text NOT NULL DEFAULT 'PENDING',  -- PENDING | VERIFIED | REJECTED
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_documents_merchant ON merchant_documents (merchant_id);

-- 0012 — Proof of payment for float credit requests (FLOAT-3). The maker
-- (initiator) must attach evidence — a bank slip / transfer receipt — that the
-- checker reviews before approving. Stored as bytea (covered by encrypted
-- backups, SEC-B); served only through the admin-authenticated download endpoint.

ALTER TABLE float_credit_requests
  ADD COLUMN IF NOT EXISTS proof_file_name    text,
  ADD COLUMN IF NOT EXISTS proof_content_type text,
  ADD COLUMN IF NOT EXISTS proof_byte_size    integer,
  ADD COLUMN IF NOT EXISTS proof_content      bytea;

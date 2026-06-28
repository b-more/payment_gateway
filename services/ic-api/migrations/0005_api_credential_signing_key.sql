-- 0005_api_credential_signing_key.sql
-- Dual-key API auth (resolves NN-7 vs SEC-API2/3). `secret_hash` remains the
-- one-way hash of the API secret (NN-7, never retrievable). The signing key is a
-- SEPARATE per-credential key, stored encrypted at rest (AES-256-GCM) and used
-- only to verify HMAC request signatures (SEC-API2/3).
ALTER TABLE api_credentials
  ADD COLUMN signing_key_ciphertext text, -- base64(iv|tag|ciphertext); decrypt with API_SIGNING_ENC_KEY
  ADD COLUMN signing_key_kid        text; -- id of the env key used, for rotation

-- Table-level grants from 0003 already extend to new columns; no regrant needed.

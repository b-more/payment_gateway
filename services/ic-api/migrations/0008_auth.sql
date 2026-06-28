-- 0008_auth.sql
-- Portal authentication (§7.1): password login → email OTP → rotating sessions.

ALTER TABLE users
  ADD COLUMN password_hash      text,
  ADD COLUMN failed_login_count int NOT NULL DEFAULT 0,
  ADD COLUMN locked_until       timestamptz,
  ADD COLUMN last_login_at      timestamptz;

-- Email OTP challenges (SEC-A1): 6 digits, single-use, short-lived, rate-limited.
CREATE TABLE otp_challenges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  purpose     text NOT NULL DEFAULT 'LOGIN',
  code_hash   text NOT NULL,            -- scrypt hash; never the plaintext code
  attempts    int  NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_user ON otp_challenges(user_id);

-- Rotating refresh sessions (SEC-A3/A6). Access tokens are stateless JWTs.
CREATE TABLE auth_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id),
  scope              user_scope NOT NULL,
  refresh_token_hash text NOT NULL UNIQUE,  -- sha256; opaque token never stored
  rotated_from       uuid REFERENCES auth_sessions(id),
  ip_address         text,
  user_agent         text,
  expires_at         timestamptz NOT NULL,
  revoked_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON auth_sessions(user_id);

-- Both portals authenticate; grant to admin + merchant roles (SEC-D7). The new
-- users columns inherit the existing table-level grants.
GRANT SELECT, INSERT, UPDATE ON otp_challenges TO ic_app_admin, ic_app_merchant;
GRANT SELECT, INSERT, UPDATE ON auth_sessions  TO ic_app_admin, ic_app_merchant;

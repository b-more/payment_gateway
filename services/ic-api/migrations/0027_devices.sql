-- 0027_devices.sql
-- Per-terminal device registration for the Z100 SmartPOS merchant app.
--
-- A device is a first-class managed object (label, status, activation lifecycle,
-- last-seen) that a merchant registers under one of their COLLECTION accounts.
-- The credential a device actually presents is a normal api_credentials row with
-- a new device_id, so the entire existing ApiAuthGuard path is reused unchanged
-- and revoking a device is just revoking its credential row.

CREATE TYPE device_status AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

CREATE TABLE devices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES accounts(id),   -- must be a COLLECTION account (enforced in app)
  merchant_id           uuid NOT NULL REFERENCES merchants(id),
  label                 text NOT NULL,                           -- e.g. "Till 3 - Kabwata"
  serial_number         text,                                    -- Z100 hardware serial, captured at activation
  environment           credential_environment NOT NULL,         -- matches the minted credential (SANDBOX|LIVE)
  status                device_status NOT NULL DEFAULT 'PENDING',
  activation_ref        text,                                    -- short public lookup ref for the one-time code
  activation_code_hash  text,                                    -- argon2id of the full one-time code; nulled after use
  activation_expires_at timestamptz,
  activated_at          timestamptz,
  credential_id         uuid REFERENCES api_credentials(id),     -- set at activation
  last_seen_at          timestamptz,
  revoked_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- A label is unique within an account; the activation ref is globally unique
-- while it is live (nulled once the code is consumed).
CREATE UNIQUE INDEX uq_devices_account_label ON devices (account_id, label);
CREATE UNIQUE INDEX uq_devices_activation_ref ON devices (activation_ref) WHERE activation_ref IS NOT NULL;

-- The credential a device presents. Nullable (existing credentials have none);
-- a credential belongs to at most one device.
ALTER TABLE api_credentials ADD COLUMN device_id uuid REFERENCES devices(id);
CREATE UNIQUE INDEX uq_api_credentials_device ON api_credentials (device_id) WHERE device_id IS NOT NULL;

-- Per-terminal attribution on the ledger. Nullable; existing rows unaffected.
ALTER TABLE transactions ADD COLUMN device_id uuid REFERENCES devices(id);

CREATE TRIGGER trg_devices_updated
  BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Grants (mirrors 0003/0023). The external API activates devices and stamps
-- transactions; the merchant portal creates/lists/revokes; admin mirrors for support.
GRANT SELECT, INSERT, UPDATE ON devices TO ic_app_api;
GRANT SELECT, INSERT, UPDATE ON devices TO ic_app_merchant;
GRANT SELECT, INSERT, UPDATE ON devices TO ic_app_admin;

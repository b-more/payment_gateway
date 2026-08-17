-- 0028_products.sql
-- Product catalog for the POS terminal: a merchant's goods/services with prices.
-- Scoped to the COLLECTION account, so every terminal on that account shares the
-- same catalog. Managed from the terminal (and later the portal) via device-auth
-- endpoints; selling taps items into a cart and charges the total as a collection.

CREATE TABLE products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id),
  name         text NOT NULL,
  price_ngwee  bigint NOT NULL CHECK (price_ngwee >= 0),
  category     text,
  active       boolean NOT NULL DEFAULT true,
  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_account ON products (account_id) WHERE active;

CREATE TRIGGER trg_products_updated
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON products TO ic_app_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO ic_app_merchant;
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO ic_app_admin;

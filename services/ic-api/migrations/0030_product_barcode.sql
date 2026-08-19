-- Product barcodes: an optional code attached to a catalog item so the POS can
-- scan an item onto the cart. Matching is done on the terminal against the
-- catalog it already holds, so this is just storage + a lookup index. Existing
-- table-level grants on `products` already cover the new column.

ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode text;

CREATE INDEX IF NOT EXISTS products_account_barcode_idx
  ON products (account_id, barcode) WHERE barcode IS NOT NULL;

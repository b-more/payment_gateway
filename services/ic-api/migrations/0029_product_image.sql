-- Product images: an optional photo attached to a catalog item, shown on the
-- POS "Sell" grid and in item management. Stored inline as bytea (small,
-- device-compressed to a few hundred KB) so it needs no object store. Existing
-- table-level grants on `products` already cover these new columns.

ALTER TABLE products ADD COLUMN IF NOT EXISTS image_data bytea;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_mime text;

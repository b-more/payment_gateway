-- ZamPay settlements: our own unique identifier + searchable batch reference.
--
-- A bank batch reference is one-to-many (one batch pays out many settlements), so
-- it can't identify a single row. Give every settlement a unique InstacomPay bank
-- reference (IBR-XXXXXXXXXX) as OUR identifier; index the bank batch reference so
-- an operator can pull up every settlement paid under one batch.

ALTER TABLE zampay_settlements ADD COLUMN IF NOT EXISTS instacom_bank_ref text;

-- Backfill existing rows (each gets a distinct value).
UPDATE zampay_settlements
   SET instacom_bank_ref = 'IBR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
 WHERE instacom_bank_ref IS NULL;

-- New rows auto-generate one; enforce presence + uniqueness.
ALTER TABLE zampay_settlements
  ALTER COLUMN instacom_bank_ref SET DEFAULT ('IBR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)));
ALTER TABLE zampay_settlements ALTER COLUMN instacom_bank_ref SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_zampay_instacom_bank_ref ON zampay_settlements (instacom_bank_ref);
CREATE INDEX IF NOT EXISTS idx_zampay_bank_batch_reference ON zampay_settlements (bank_batch_reference);

COMMENT ON COLUMN zampay_settlements.instacom_bank_ref IS
  'Unique InstacomPay bank reference — our identifier for the settlement payout.';

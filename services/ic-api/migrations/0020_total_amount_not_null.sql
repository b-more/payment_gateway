-- 0020_total_amount_not_null.sql
-- Enforce total_amount now that the application always writes it.
--
-- Split from 0019 on purpose. 0019 runs while the PREVIOUS image is still
-- serving, and that image does not know about total_amount, so a NOT NULL there
-- would reject its inserts for the length of the deploy. This file runs only
-- after the new code is live and verified, at which point every writer supplies
-- the column and the constraint can be tightened safely.
--
-- Re-runnable: the backfill covers anything the old image wrote in between.

UPDATE transactions SET total_amount = amount WHERE total_amount IS NULL;

ALTER TABLE transactions
  ALTER COLUMN total_amount SET NOT NULL;

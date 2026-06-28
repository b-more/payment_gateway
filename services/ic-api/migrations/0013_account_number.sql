-- Human-readable, sequential account numbers with a type identifier.
--   COLLECTION   -> COL-NNNNNNN
--   DISBURSEMENT -> DIS-NNNNNNN
--   OVA          -> OVA-NNNNNNN
--   BANK         -> BNK-NNNNNNN
-- The UUID `id` stays the primary key / FK target; `account_number` is an
-- additional unique business key shown to humans. Per-type sequences start at
-- 1001, so the first collection account is COL-0001001.

CREATE SEQUENCE IF NOT EXISTS account_seq_col START WITH 1001;
CREATE SEQUENCE IF NOT EXISTS account_seq_dis START WITH 1001;
CREATE SEQUENCE IF NOT EXISTS account_seq_ova START WITH 1001;
CREATE SEQUENCE IF NOT EXISTS account_seq_bnk START WITH 1001;

-- Format the next number for a given account type. SECURITY DEFINER so the
-- nextval() works for any inserting role without per-sequence grants.
CREATE OR REPLACE FUNCTION gen_account_number(atype account_type)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN CASE atype
    WHEN 'COLLECTION'   THEN 'COL-' || lpad(nextval('account_seq_col')::text, 7, '0')
    WHEN 'DISBURSEMENT' THEN 'DIS-' || lpad(nextval('account_seq_dis')::text, 7, '0')
    WHEN 'OVA'          THEN 'OVA-' || lpad(nextval('account_seq_ova')::text, 7, '0')
    WHEN 'BANK'         THEN 'BNK-' || lpad(nextval('account_seq_bnk')::text, 7, '0')
  END;
END;
$$;

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_number text;

-- Backfill existing accounts in creation order, per type.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, account_type FROM accounts WHERE account_number IS NULL ORDER BY created_at, id LOOP
    UPDATE accounts SET account_number = gen_account_number(r.account_type) WHERE id = r.id;
  END LOOP;
END $$;

-- Auto-assign on every future insert (covers all code paths, incl. tests).
CREATE OR REPLACE FUNCTION set_account_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.account_number IS NULL THEN
    NEW.account_number := gen_account_number(NEW.account_type);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_account_number ON accounts;
CREATE TRIGGER trg_account_number
  BEFORE INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_account_number();

ALTER TABLE accounts ALTER COLUMN account_number SET NOT NULL;
ALTER TABLE accounts ADD CONSTRAINT accounts_account_number_key UNIQUE (account_number);

-- App roles already have SELECT/INSERT on accounts (0003); the read paths just
-- need the new column, which the table grant already covers. Allow the inserter
-- to advance the sequences directly too (belt-and-suspenders alongside the
-- SECURITY DEFINER function).
GRANT USAGE ON SEQUENCE account_seq_col, account_seq_dis, account_seq_ova, account_seq_bnk
  TO ic_app_admin, ic_app_api, ic_app_merchant;

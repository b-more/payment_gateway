-- 0026_zampay_environment.sql
-- Record which ZamPay environment each settlement targeted, so sandbox (TEST)
-- settlements can be badged and never mistaken for live ones once we go live.
-- Every row that exists today was made against the ZamPay TEST sandbox, so they
-- are backfilled to 'TEST'. The default is the conservative 'PRODUCTION'; the
-- orchestration always sets it explicitly from ZAMPAY_ENV.

ALTER TABLE zampay_settlements ADD COLUMN environment text NOT NULL DEFAULT 'PRODUCTION';

UPDATE zampay_settlements SET environment = 'TEST';

COMMENT ON COLUMN zampay_settlements.environment IS
  'ZamPay environment the settlement targeted: TEST (sandbox) or PRODUCTION.';

-- 0001_enable_extensions.sql
-- Infrastructure only. Enables pgcrypto for gen_random_uuid(), used by the
-- UUID primary keys in the data model (§4). Additive and idempotent.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

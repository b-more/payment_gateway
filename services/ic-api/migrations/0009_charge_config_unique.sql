-- 0009_charge_config_unique.sql
-- One charge config per (account, processor) so the admin Configurations screen
-- can upsert it and the money engine reads it deterministically (§4.4, §6.1.2).
ALTER TABLE charge_configs
  ADD CONSTRAINT uq_charge_configs_account_processor UNIQUE (account_id, processor);

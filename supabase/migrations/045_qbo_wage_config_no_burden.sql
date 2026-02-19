-- Wage accounts that are 1099 / subcontractor - do not apply burden %
ALTER TABLE qbo_wage_allocation_config
  ADD COLUMN IF NOT EXISTS account_ids_no_burden TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN qbo_wage_allocation_config.account_ids_no_burden IS 'QBO account IDs that are wages but 1099/no burden (e.g. 198).';

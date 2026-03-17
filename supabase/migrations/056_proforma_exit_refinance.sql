-- Refinance / Exit inputs for proforma (Phase 2)
ALTER TABLE proforma_inputs
  ADD COLUMN IF NOT EXISTS exit_cap_rate NUMERIC(5, 2);

ALTER TABLE proforma_inputs
  ADD COLUMN IF NOT EXISTS refinance_ltv_percent NUMERIC(5, 2);

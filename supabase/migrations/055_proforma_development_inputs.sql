-- Full development proforma inputs (Sources & Uses, draw schedule, IDC)
ALTER TABLE proforma_inputs
  ADD COLUMN IF NOT EXISTS use_development_proforma BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE proforma_inputs
  ADD COLUMN IF NOT EXISTS land_cost NUMERIC(15, 2) DEFAULT 0;

ALTER TABLE proforma_inputs
  ADD COLUMN IF NOT EXISTS soft_cost_percent NUMERIC(5, 2) DEFAULT 0;

ALTER TABLE proforma_inputs
  ADD COLUMN IF NOT EXISTS contingency_percent NUMERIC(5, 2) DEFAULT 0;

ALTER TABLE proforma_inputs
  ADD COLUMN IF NOT EXISTS construction_months INTEGER;

ALTER TABLE proforma_inputs
  ADD COLUMN IF NOT EXISTS loan_to_cost_percent NUMERIC(5, 2) DEFAULT 0;

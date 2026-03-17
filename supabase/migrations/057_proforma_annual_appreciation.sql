-- Add optional annual appreciation percent to proforma_inputs for display-only annual value schedule

ALTER TABLE proforma_inputs
  ADD COLUMN IF NOT EXISTS annual_appreciation_percent NUMERIC;


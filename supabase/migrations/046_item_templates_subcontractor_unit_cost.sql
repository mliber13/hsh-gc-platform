-- Add default subcontractor unit cost (per unit) to item_templates.
-- Existing default_subcontractor_cost remains as lump-sum option.
ALTER TABLE item_templates
  ADD COLUMN IF NOT EXISTS default_subcontractor_rate NUMERIC DEFAULT 0;

COMMENT ON COLUMN item_templates.default_subcontractor_rate IS 'Default subcontractor cost per unit (unit cost), e.g. per LF, per each';

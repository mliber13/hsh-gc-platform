-- Add rate source (provenance) fields to item_templates for audit/history.
-- e.g. "Rate from Tapco, 2025-02-15" so we know who provided the rate and when.
ALTER TABLE item_templates
  ADD COLUMN IF NOT EXISTS rate_source_name TEXT,
  ADD COLUMN IF NOT EXISTS rate_source_date DATE,
  ADD COLUMN IF NOT EXISTS rate_source_notes TEXT;

COMMENT ON COLUMN item_templates.rate_source_name IS 'Subcontractor or vendor who provided this rate (e.g. Tapco)';
COMMENT ON COLUMN item_templates.rate_source_date IS 'Date the rate was provided or last updated';
COMMENT ON COLUMN item_templates.rate_source_notes IS 'Optional notes (e.g. Per email; includes XYZ)';

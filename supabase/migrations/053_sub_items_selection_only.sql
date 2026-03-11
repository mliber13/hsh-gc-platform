-- Sub-items: optional "selection only" mode and selection payload
-- When selection_only = true, sub-item does not contribute to trade cost; it holds product/color choices only.

ALTER TABLE sub_items
  ADD COLUMN IF NOT EXISTS selection_only BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE sub_items
  ADD COLUMN IF NOT EXISTS selection JSONB DEFAULT NULL;

COMMENT ON COLUMN sub_items.selection_only IS 'When true, this sub-item is for selections only (e.g. paint color per room); cost fields are ignored for roll-up.';
COMMENT ON COLUMN sub_items.selection IS 'Structured selection data (e.g. paint, fixture, cabinetry) keyed by type; shape varies by use.';

-- Add JSON column for default sub-items on item templates.
-- Stores an array of lightweight sub-item objects used when applying item templates.

ALTER TABLE item_templates
  ADD COLUMN IF NOT EXISTS default_sub_items JSONB;

COMMENT ON COLUMN item_templates.default_sub_items IS 'Optional default sub-items (breakdown) for this item template.';


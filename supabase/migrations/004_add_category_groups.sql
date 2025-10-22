-- ============================================================================
-- Add Category Groups Migration
-- ============================================================================
-- 
-- Add group field to categorize trades into higher-level groups
-- for better cost reporting and variance analysis

-- Add group column to trades table
ALTER TABLE trades ADD COLUMN "group" TEXT;

-- Add group column to labor_entries table
ALTER TABLE labor_entries ADD COLUMN "group" TEXT;

-- Add group column to material_entries table
ALTER TABLE material_entries ADD COLUMN "group" TEXT;

-- Add group column to subcontractor_entries table
ALTER TABLE subcontractor_entries ADD COLUMN "group" TEXT;

-- Add group column to item_templates table
ALTER TABLE item_templates ADD COLUMN "group" TEXT;

-- Backfill existing records with calculated group values
UPDATE trades SET "group" = CASE
  WHEN category = 'planning' THEN 'admin'
  WHEN category IN ('site-prep', 'excavation-foundation', 'utilities', 'water-sewer', 'roofing', 'masonry-paving', 'porches-decks', 'exterior-finishes') THEN 'exterior'
  WHEN category IN ('rough-framing', 'windows-doors') THEN 'structure'
  WHEN category IN ('insulation', 'plumbing', 'electrical', 'hvac') THEN 'mep'
  WHEN category IN ('drywall', 'interior-finishes', 'kitchen', 'bath', 'appliances') THEN 'interior'
  WHEN category = 'other' THEN 'other'
  ELSE 'other'
END;

-- Backfill labor_entries
UPDATE labor_entries SET "group" = CASE
  WHEN category = 'planning' THEN 'admin'
  WHEN category IN ('site-prep', 'excavation-foundation', 'utilities', 'water-sewer', 'roofing', 'masonry-paving', 'porches-decks', 'exterior-finishes') THEN 'exterior'
  WHEN category IN ('rough-framing', 'windows-doors') THEN 'structure'
  WHEN category IN ('insulation', 'plumbing', 'electrical', 'hvac') THEN 'mep'
  WHEN category IN ('drywall', 'interior-finishes', 'kitchen', 'bath', 'appliances') THEN 'interior'
  WHEN category = 'other' THEN 'other'
  ELSE 'other'
END;

-- Backfill material_entries
UPDATE material_entries SET "group" = CASE
  WHEN category = 'planning' THEN 'admin'
  WHEN category IN ('site-prep', 'excavation-foundation', 'utilities', 'water-sewer', 'roofing', 'masonry-paving', 'porches-decks', 'exterior-finishes') THEN 'exterior'
  WHEN category IN ('rough-framing', 'windows-doors') THEN 'structure'
  WHEN category IN ('insulation', 'plumbing', 'electrical', 'hvac') THEN 'mep'
  WHEN category IN ('drywall', 'interior-finishes', 'kitchen', 'bath', 'appliances') THEN 'interior'
  WHEN category = 'other' THEN 'other'
  ELSE 'other'
END;

-- Backfill subcontractor_entries
UPDATE subcontractor_entries SET "group" = CASE
  WHEN category = 'planning' THEN 'admin'
  WHEN category IN ('site-prep', 'excavation-foundation', 'utilities', 'water-sewer', 'roofing', 'masonry-paving', 'porches-decks', 'exterior-finishes') THEN 'exterior'
  WHEN category IN ('rough-framing', 'windows-doors') THEN 'structure'
  WHEN category IN ('insulation', 'plumbing', 'electrical', 'hvac') THEN 'mep'
  WHEN category IN ('drywall', 'interior-finishes', 'kitchen', 'bath', 'appliances') THEN 'interior'
  WHEN category = 'other' THEN 'other'
  ELSE 'other'
END;

-- Backfill item_templates
UPDATE item_templates SET "group" = CASE
  WHEN category = 'planning' THEN 'admin'
  WHEN category IN ('site-prep', 'excavation-foundation', 'utilities', 'water-sewer', 'roofing', 'masonry-paving', 'porches-decks', 'exterior-finishes') THEN 'exterior'
  WHEN category IN ('rough-framing', 'windows-doors') THEN 'structure'
  WHEN category IN ('insulation', 'plumbing', 'electrical', 'hvac') THEN 'mep'
  WHEN category IN ('drywall', 'interior-finishes', 'kitchen', 'bath', 'appliances') THEN 'interior'
  WHEN category = 'other' THEN 'other'
  ELSE 'other'
END;

-- Add indexes for performance
CREATE INDEX idx_trades_group ON trades("group");
CREATE INDEX idx_labor_entries_group ON labor_entries("group");
CREATE INDEX idx_material_entries_group ON material_entries("group");
CREATE INDEX idx_subcontractor_entries_group ON subcontractor_entries("group");
CREATE INDEX idx_item_templates_group ON item_templates("group");

-- Add comments for documentation
COMMENT ON COLUMN trades."group" IS 'High-level category group for cost rollup and reporting';
COMMENT ON COLUMN labor_entries."group" IS 'High-level category group for cost rollup and reporting';
COMMENT ON COLUMN material_entries."group" IS 'High-level category group for cost rollup and reporting';
COMMENT ON COLUMN subcontractor_entries."group" IS 'High-level category group for cost rollup and reporting';
COMMENT ON COLUMN item_templates."group" IS 'High-level category group for cost rollup and reporting';

-- ============================================================================
-- Migration: Create Sub-Items Table
-- ============================================================================
--
-- Creates a table for sub-items that belong to trades in estimates.
-- Sub-items allow for more granular breakdown of trade line items.
-- Example: "Bath Hardware" trade can have sub-items like "Towel bars", 
-- "TP holders", "Shower rods", etc.
--

-- Create the sub_items table
CREATE TABLE sub_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  trade_id UUID REFERENCES trades(id) ON DELETE CASCADE NOT NULL,
  estimate_id UUID REFERENCES estimates(id) ON DELETE CASCADE NOT NULL,
  organization_id TEXT NOT NULL,
  
  -- Identification
  name TEXT NOT NULL,
  description TEXT,
  
  -- Quantities
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL, -- UnitType enum
  
  -- Costs (roll up to parent trade)
  labor_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  labor_rate NUMERIC(12, 2),
  labor_hours NUMERIC(12, 2),
  
  material_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  material_rate NUMERIC(12, 2),
  
  subcontractor_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  is_subcontracted BOOLEAN NOT NULL DEFAULT false,
  
  -- Waste factors
  waste_factor NUMERIC(5, 2) NOT NULL DEFAULT 10.0, -- Percentage
  
  -- Markup
  markup_percent NUMERIC(5, 2),
  
  -- Total cost for this sub-item
  total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  
  -- Order/grouping
  sort_order INTEGER NOT NULL DEFAULT 0,
  
  -- Estimate status tracking (inherits from parent trade by default)
  estimate_status TEXT, -- 'budget' | 'quoted' | 'approved'
  quote_vendor TEXT,
  quote_date TIMESTAMPTZ,
  quote_reference TEXT,
  quote_file_url TEXT,
  
  -- Notes
  notes TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster lookups
CREATE INDEX idx_sub_items_trade_id ON sub_items(trade_id);
CREATE INDEX idx_sub_items_estimate_id ON sub_items(estimate_id);
CREATE INDEX idx_sub_items_organization_id ON sub_items(organization_id);
CREATE INDEX idx_sub_items_sort_order ON sub_items(trade_id, sort_order);

-- Enable Row Level Security
ALTER TABLE sub_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view sub-items in their organization
CREATE POLICY "Users can view sub-items in their organization"
  ON sub_items FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can create sub-items in their organization
CREATE POLICY "Users can create sub-items in their organization"
  ON sub_items FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can update sub-items in their organization
CREATE POLICY "Users can update sub-items in their organization"
  ON sub_items FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can delete sub-items in their organization
CREATE POLICY "Users can delete sub-items in their organization"
  ON sub_items FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Add trigger to update updated_at column
CREATE TRIGGER update_sub_items_updated_at
  BEFORE UPDATE ON sub_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Update actuals tables to support sub-item linking
-- ============================================================================

-- Add sub_item_id to labor_entries
ALTER TABLE labor_entries 
ADD COLUMN IF NOT EXISTS sub_item_id UUID REFERENCES sub_items(id) ON DELETE SET NULL;

-- Add sub_item_id to material_entries
ALTER TABLE material_entries 
ADD COLUMN IF NOT EXISTS sub_item_id UUID REFERENCES sub_items(id) ON DELETE SET NULL;

-- Add sub_item_id to subcontractor_entries
ALTER TABLE subcontractor_entries 
ADD COLUMN IF NOT EXISTS sub_item_id UUID REFERENCES sub_items(id) ON DELETE SET NULL;

-- Add invoice splitting fields to material_entries
ALTER TABLE material_entries
ADD COLUMN IF NOT EXISTS is_split_entry BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS split_parent_id UUID REFERENCES material_entries(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS split_allocation NUMERIC(12, 2);

-- Create indexes for sub-item linking
CREATE INDEX IF NOT EXISTS idx_labor_entries_sub_item_id ON labor_entries(sub_item_id);
CREATE INDEX IF NOT EXISTS idx_material_entries_sub_item_id ON material_entries(sub_item_id);
CREATE INDEX IF NOT EXISTS idx_subcontractor_entries_sub_item_id ON subcontractor_entries(sub_item_id);
CREATE INDEX IF NOT EXISTS idx_material_entries_split_parent_id ON material_entries(split_parent_id);


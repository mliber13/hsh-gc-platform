-- ============================================================================
-- Create SOW Templates Table
-- ============================================================================
-- 
-- Scope of Work (SOW) templates for reuse in quote requests
--

-- SOW Templates Table
CREATE TABLE IF NOT EXISTS sow_templates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE, -- NULL for system templates
  organization_id UUID,
  
  -- Template details
  name TEXT NOT NULL,
  description TEXT,
  trade_category TEXT, -- TradeCategory enum
  
  -- SOW content (stored as JSON)
  tasks JSONB DEFAULT '[]'::jsonb NOT NULL, -- Array of {id, description, order}
  materials_included JSONB DEFAULT '[]'::jsonb NOT NULL, -- Array of {id, description, order}
  materials_excluded JSONB DEFAULT '[]'::jsonb NOT NULL, -- Array of {id, description, order}
  specifications JSONB DEFAULT '[]'::jsonb NOT NULL, -- Array of {id, label, value, order}
  
  -- Usage tracking
  use_count INTEGER DEFAULT 0 NOT NULL,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sow_templates_user_id ON sow_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_sow_templates_organization_id ON sow_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_sow_templates_trade_category ON sow_templates(trade_category);

-- RLS Policies
ALTER TABLE sow_templates ENABLE ROW LEVEL SECURITY;

-- Users can view their own SOW templates
DROP POLICY IF EXISTS "Users can view own SOW templates" ON sow_templates;
CREATE POLICY "Users can view own SOW templates"
  ON sow_templates FOR SELECT
  USING (auth.uid() = user_id);

-- Users can view organization SOW templates
DROP POLICY IF EXISTS "Users can view organization SOW templates" ON sow_templates;
CREATE POLICY "Users can view organization SOW templates"
  ON sow_templates FOR SELECT
  USING (
    organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND organization_id = profiles.organization_id
    )
  );

-- Users can create their own SOW templates
DROP POLICY IF EXISTS "Users can create own SOW templates" ON sow_templates;
CREATE POLICY "Users can create own SOW templates"
  ON sow_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own SOW templates
DROP POLICY IF EXISTS "Users can update own SOW templates" ON sow_templates;
CREATE POLICY "Users can update own SOW templates"
  ON sow_templates FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own SOW templates
DROP POLICY IF EXISTS "Users can delete own SOW templates" ON sow_templates;
CREATE POLICY "Users can delete own SOW templates"
  ON sow_templates FOR DELETE
  USING (auth.uid() = user_id);

-- Update trigger for updated_at
CREATE TRIGGER update_sow_templates_updated_at BEFORE UPDATE ON sow_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


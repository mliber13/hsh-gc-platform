-- ============================================================================
-- Migration: Deal Workspace Context (Notes/Tasks)
-- ============================================================================

CREATE TABLE IF NOT EXISTS deal_workspace_context (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  organization_id TEXT NOT NULL DEFAULT 'default-org',
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes_text TEXT NOT NULL DEFAULT '',
  tasks_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_deal_workspace_context_deal
  ON deal_workspace_context(deal_id);

CREATE INDEX IF NOT EXISTS idx_deal_workspace_context_org
  ON deal_workspace_context(organization_id);

ALTER TABLE deal_workspace_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view deal workspace context in organization"
  ON deal_workspace_context FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create deal workspace context in organization"
  ON deal_workspace_context FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update deal workspace context in organization"
  ON deal_workspace_context FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete deal workspace context in organization"
  ON deal_workspace_context FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION update_deal_workspace_context_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_deal_workspace_context_updated_at ON deal_workspace_context;
CREATE TRIGGER trigger_update_deal_workspace_context_updated_at
  BEFORE UPDATE ON deal_workspace_context
  FOR EACH ROW
  EXECUTE FUNCTION update_deal_workspace_context_updated_at();

-- ============================================================================
-- Migration: Selection Schedule Versions
-- ============================================================================

CREATE TABLE IF NOT EXISTS selection_schedule_versions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  organization_id TEXT NOT NULL DEFAULT 'default-org',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version_number INTEGER NOT NULL CHECK (version_number >= 0),
  version_label TEXT,
  is_draft BOOLEAN NOT NULL DEFAULT true,
  schedule_data JSONB NOT NULL DEFAULT '{"rows":[]}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_selection_schedule_project_version
  ON selection_schedule_versions(project_id, version_number);

CREATE UNIQUE INDEX IF NOT EXISTS uq_selection_schedule_project_draft
  ON selection_schedule_versions(project_id)
  WHERE is_draft = true;

CREATE INDEX IF NOT EXISTS idx_selection_schedule_project_id
  ON selection_schedule_versions(project_id);

CREATE INDEX IF NOT EXISTS idx_selection_schedule_org_id
  ON selection_schedule_versions(organization_id);

ALTER TABLE selection_schedule_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view selection schedules in organization"
  ON selection_schedule_versions FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create selection schedules in organization"
  ON selection_schedule_versions FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update selection schedules in organization"
  ON selection_schedule_versions FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete selection schedules in organization"
  ON selection_schedule_versions FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION update_selection_schedule_versions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_selection_schedule_versions_updated_at ON selection_schedule_versions;
CREATE TRIGGER update_selection_schedule_versions_updated_at
  BEFORE UPDATE ON selection_schedule_versions
  FOR EACH ROW
  EXECUTE FUNCTION update_selection_schedule_versions_updated_at();

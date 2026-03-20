-- ============================================================================
-- Migration: Project Pro Forma Versions
-- ============================================================================
--
-- Stores versioned snapshots of project-mode pro forma inputs.
--

CREATE TABLE IF NOT EXISTS project_proforma_versions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  organization_id TEXT NOT NULL DEFAULT 'default-org',
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version_number INTEGER NOT NULL CHECK (version_number >= 1),
  version_label TEXT,
  inputs_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_proforma_versions_project_version
  ON project_proforma_versions(project_id, version_number);

CREATE INDEX IF NOT EXISTS idx_project_proforma_versions_project_id
  ON project_proforma_versions(project_id);

CREATE INDEX IF NOT EXISTS idx_project_proforma_versions_org_id
  ON project_proforma_versions(organization_id);

CREATE INDEX IF NOT EXISTS idx_project_proforma_versions_updated_at
  ON project_proforma_versions(updated_at DESC);

ALTER TABLE project_proforma_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view project proforma versions in their organization"
  ON project_proforma_versions FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create project proforma versions in their organization"
  ON project_proforma_versions FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update project proforma versions in their organization"
  ON project_proforma_versions FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete project proforma versions in their organization"
  ON project_proforma_versions FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION update_project_proforma_versions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_project_proforma_versions_updated_at ON project_proforma_versions;
CREATE TRIGGER update_project_proforma_versions_updated_at
  BEFORE UPDATE ON project_proforma_versions
  FOR EACH ROW
  EXECUTE FUNCTION update_project_proforma_versions_updated_at();

COMMENT ON TABLE project_proforma_versions IS 'Versioned project pro forma input snapshots';

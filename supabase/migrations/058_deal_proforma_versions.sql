-- ============================================================================
-- Migration: Deal Pro Forma Versions
-- ============================================================================
--
-- Stores underwriting pro forma inputs for deal pipeline records with
-- collaborative org-wide access and per-deal version sequencing.
--

CREATE TABLE IF NOT EXISTS deal_proforma_versions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  organization_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version_number INTEGER NOT NULL CHECK (version_number >= 0),
  version_label TEXT,
  is_draft BOOLEAN NOT NULL DEFAULT false,
  inputs_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One numbered version slot per deal; draft uses version_number = 0
CREATE UNIQUE INDEX IF NOT EXISTS uq_deal_proforma_versions_deal_version
  ON deal_proforma_versions(deal_id, version_number);

-- At most one draft per deal
CREATE UNIQUE INDEX IF NOT EXISTS uq_deal_proforma_versions_single_draft
  ON deal_proforma_versions(deal_id)
  WHERE is_draft = true;

CREATE INDEX IF NOT EXISTS idx_deal_proforma_versions_deal_id
  ON deal_proforma_versions(deal_id);

CREATE INDEX IF NOT EXISTS idx_deal_proforma_versions_org_id
  ON deal_proforma_versions(organization_id);

CREATE INDEX IF NOT EXISTS idx_deal_proforma_versions_updated_at
  ON deal_proforma_versions(updated_at DESC);

ALTER TABLE deal_proforma_versions ENABLE ROW LEVEL SECURITY;

-- Org-wide collaborative read access
CREATE POLICY "Users can view deal proforma versions in their organization"
  ON deal_proforma_versions FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Org-wide collaborative create access
CREATE POLICY "Users can create deal proforma versions in their organization"
  ON deal_proforma_versions FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Org-wide collaborative update access
CREATE POLICY "Users can update deal proforma versions in their organization"
  ON deal_proforma_versions FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Org-wide collaborative delete access
CREATE POLICY "Users can delete deal proforma versions in their organization"
  ON deal_proforma_versions FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION update_deal_proforma_versions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_deal_proforma_versions_updated_at ON deal_proforma_versions;
CREATE TRIGGER update_deal_proforma_versions_updated_at
  BEFORE UPDATE ON deal_proforma_versions
  FOR EACH ROW
  EXECUTE FUNCTION update_deal_proforma_versions_updated_at();

COMMENT ON TABLE deal_proforma_versions IS 'Versioned deal pipeline pro forma input snapshots';

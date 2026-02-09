-- ============================================================================
-- Contact Directory: Municipalities + Lenders (entity structure like subs/suppliers)
-- ============================================================================
--
-- Municipalities: e.g. City of Columbiana - multiple officials/inspectors per entity.
-- Lenders: e.g. bank or lender org - multiple contacts per entity.
-- Inspectors can be standalone (People) or contacts under a Municipality.
--

-- ============================================================================
-- MUNICIPALITIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS municipalities (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'default-org',
  name TEXT NOT NULL,
  jurisdiction TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (char_length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_municipalities_organization_id ON municipalities (organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_municipalities_org_name_unique ON municipalities (organization_id, lower(name));

ALTER TABLE municipalities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view organization municipalities" ON municipalities;
CREATE POLICY "Users can view organization municipalities"
  ON municipalities FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

DROP POLICY IF EXISTS "Users can insert organization municipalities" ON municipalities;
CREATE POLICY "Users can insert organization municipalities"
  ON municipalities FOR INSERT
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Users can update organization municipalities" ON municipalities;
CREATE POLICY "Users can update organization municipalities"
  ON municipalities FOR UPDATE
  USING (organization_id = get_user_organization() AND user_can_edit())
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Users can delete organization municipalities" ON municipalities;
CREATE POLICY "Users can delete organization municipalities"
  ON municipalities FOR DELETE
  USING (organization_id = get_user_organization() AND user_can_edit());

CREATE TRIGGER update_municipalities_updated_at
  BEFORE UPDATE ON municipalities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- LENDERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS lenders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'default-org',
  name TEXT NOT NULL,
  type TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (char_length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_lenders_organization_id ON lenders (organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lenders_org_name_unique ON lenders (organization_id, lower(name));

ALTER TABLE lenders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view organization lenders" ON lenders;
CREATE POLICY "Users can view organization lenders"
  ON lenders FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

DROP POLICY IF EXISTS "Users can insert organization lenders" ON lenders;
CREATE POLICY "Users can insert organization lenders"
  ON lenders FOR INSERT
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Users can update organization lenders" ON lenders;
CREATE POLICY "Users can update organization lenders"
  ON lenders FOR UPDATE
  USING (organization_id = get_user_organization() AND user_can_edit())
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Users can delete organization lenders" ON lenders;
CREATE POLICY "Users can delete organization lenders"
  ON lenders FOR DELETE
  USING (organization_id = get_user_organization() AND user_can_edit());

CREATE TRIGGER update_lenders_updated_at
  BEFORE UPDATE ON lenders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- CONTACTS: add municipality_id and lender_id
-- ============================================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS municipality_id UUID REFERENCES municipalities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS lender_id UUID REFERENCES lenders(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS idx_contacts_municipality_id;
CREATE INDEX IF NOT EXISTS idx_contacts_municipality_id ON contacts (municipality_id);
DROP INDEX IF EXISTS idx_contacts_lender_id;
CREATE INDEX IF NOT EXISTS idx_contacts_lender_id ON contacts (lender_id);

-- Replace the single-entity check to include municipality and lender
-- (Postgres may name the second CHECK contacts_check_1 or contacts_check_2)
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_check_1;
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_check_2;
ALTER TABLE contacts ADD CONSTRAINT contacts_single_entity_check CHECK (
  (subcontractor_id IS NOT NULL)::int +
  (supplier_id IS NOT NULL)::int +
  (developer_id IS NOT NULL)::int +
  (municipality_id IS NOT NULL)::int +
  (lender_id IS NOT NULL)::int <= 1
);

-- ============================================================================
-- Contact Directory: Developers table + Contacts table
-- ============================================================================
--
-- Developers: same pattern as subcontractors/suppliers (company with primary contact).
-- Contacts: labeled people; standalone (Employee, 1099, Inspector, etc.) or
-- additional contact persons under a subcontractor, supplier, or developer.
--

-- ============================================================================
-- DEVELOPERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS developers (
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

CREATE INDEX IF NOT EXISTS idx_developers_organization_id
  ON developers (organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_developers_org_name_unique
  ON developers (organization_id, lower(name));

ALTER TABLE developers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view organization developers" ON developers;
CREATE POLICY "Users can view organization developers"
  ON developers FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

DROP POLICY IF EXISTS "Users can insert organization developers" ON developers;
CREATE POLICY "Users can insert organization developers"
  ON developers FOR INSERT
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Users can update organization developers" ON developers;
CREATE POLICY "Users can update organization developers"
  ON developers FOR UPDATE
  USING (organization_id = get_user_organization() AND user_can_edit())
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Users can delete organization developers" ON developers;
CREATE POLICY "Users can delete organization developers"
  ON developers FOR DELETE
  USING (organization_id = get_user_organization() AND user_can_edit());

CREATE TRIGGER update_developers_updated_at
  BEFORE UPDATE ON developers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- CONTACTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'default-org',
  label TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  notes TEXT,
  subcontractor_id UUID REFERENCES subcontractors(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  developer_id UUID REFERENCES developers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (char_length(trim(name)) > 0),
  CHECK (
    (subcontractor_id IS NOT NULL)::int + (supplier_id IS NOT NULL)::int + (developer_id IS NOT NULL)::int <= 1
  )
);

CREATE INDEX IF NOT EXISTS idx_contacts_organization_id ON contacts (organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_label ON contacts (label);
CREATE INDEX IF NOT EXISTS idx_contacts_subcontractor_id ON contacts (subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_contacts_supplier_id ON contacts (supplier_id);
CREATE INDEX IF NOT EXISTS idx_contacts_developer_id ON contacts (developer_id);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view organization contacts" ON contacts;
CREATE POLICY "Users can view organization contacts"
  ON contacts FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

DROP POLICY IF EXISTS "Users can insert organization contacts" ON contacts;
CREATE POLICY "Users can insert organization contacts"
  ON contacts FOR INSERT
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Users can update organization contacts" ON contacts;
CREATE POLICY "Users can update organization contacts"
  ON contacts FOR UPDATE
  USING (organization_id = get_user_organization() AND user_can_edit())
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Users can delete organization contacts" ON contacts;
CREATE POLICY "Users can delete organization contacts"
  ON contacts FOR DELETE
  USING (organization_id = get_user_organization() AND user_can_edit());

CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

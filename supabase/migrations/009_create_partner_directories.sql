-- ============================================================================
-- HSH GC Platform - Partner Directories (Subcontractors & Suppliers)
-- ============================================================================
--
-- Creates shared directories that can power dropdowns and references across
-- the application. Each table is organization-scoped and supports soft
-- deactivation via the is_active flag.
--

-- ============================================================================
-- SUBCONTRACTORS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS subcontractors (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'default-org',
  name TEXT NOT NULL,
  trade TEXT,
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

CREATE INDEX IF NOT EXISTS idx_subcontractors_organization_id
  ON subcontractors (organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subcontractors_org_name_unique
  ON subcontractors (organization_id, lower(name));

ALTER TABLE subcontractors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view organization subcontractors" ON subcontractors;
CREATE POLICY "Users can view organization subcontractors"
  ON subcontractors FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

DROP POLICY IF EXISTS "Users can insert organization subcontractors" ON subcontractors;
CREATE POLICY "Users can insert organization subcontractors"
  ON subcontractors FOR INSERT
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Users can update organization subcontractors" ON subcontractors;
CREATE POLICY "Users can update organization subcontractors"
  ON subcontractors FOR UPDATE
  USING (organization_id = get_user_organization() AND user_can_edit())
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Users can delete organization subcontractors" ON subcontractors;
CREATE POLICY "Users can delete organization subcontractors"
  ON subcontractors FOR DELETE
  USING (organization_id = get_user_organization() AND user_can_edit());

CREATE TRIGGER update_subcontractors_updated_at
  BEFORE UPDATE ON subcontractors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SUPPLIERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'default-org',
  name TEXT NOT NULL,
  category TEXT,
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

CREATE INDEX IF NOT EXISTS idx_suppliers_organization_id
  ON suppliers (organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_org_name_unique
  ON suppliers (organization_id, lower(name));

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view organization suppliers" ON suppliers;
CREATE POLICY "Users can view organization suppliers"
  ON suppliers FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

DROP POLICY IF EXISTS "Users can insert organization suppliers" ON suppliers;
CREATE POLICY "Users can insert organization suppliers"
  ON suppliers FOR INSERT
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Users can update organization suppliers" ON suppliers;
CREATE POLICY "Users can update organization suppliers"
  ON suppliers FOR UPDATE
  USING (organization_id = get_user_organization() AND user_can_edit())
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Users can delete organization suppliers" ON suppliers;
CREATE POLICY "Users can delete organization suppliers"
  ON suppliers FOR DELETE
  USING (organization_id = get_user_organization() AND user_can_edit());

CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


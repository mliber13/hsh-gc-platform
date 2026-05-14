-- ============================================================================
-- Partner contact categories (org-scoped tabs for label-only partner contacts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS contact_categories (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, key),
  CHECK (char_length(trim(key)) > 0),
  CHECK (char_length(trim(label)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_contact_categories_org ON contact_categories (organization_id);

ALTER TABLE contact_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view organization contact_categories" ON contact_categories;
CREATE POLICY "Users can view organization contact_categories"
  ON contact_categories FOR SELECT
  USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
  );

DROP POLICY IF EXISTS "Users can insert organization contact_categories" ON contact_categories;
CREATE POLICY "Users can insert organization contact_categories"
  ON contact_categories FOR INSERT
  WITH CHECK (
    organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Users can update organization contact_categories" ON contact_categories;
CREATE POLICY "Users can update organization contact_categories"
  ON contact_categories FOR UPDATE
  USING (
    organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  )
  WITH CHECK (
    organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Users can delete organization contact_categories" ON contact_categories;
CREATE POLICY "Users can delete organization contact_categories"
  ON contact_categories FOR DELETE
  USING (
    organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

CREATE TRIGGER update_contact_categories_updated_at
  BEFORE UPDATE ON contact_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed five partner categories per org that already has contacts (keys match contacts.label)
INSERT INTO contact_categories (organization_id, key, label, sort_order)
SELECT o.organization_id, v.key, v.label, v.sort_order
FROM (SELECT DISTINCT organization_id FROM contacts) o
CROSS JOIN (
  VALUES
    ('ARCHITECT', 'Architects', 0),
    ('ENGINEER', 'Engineers', 1),
    ('TITLE_CLOSING', 'Title / Closing', 2),
    ('INSURANCE', 'Insurance', 3),
    ('REALTOR', 'Realtors', 4)
) AS v(key, label, sort_order)
ON CONFLICT (organization_id, key) DO NOTHING;

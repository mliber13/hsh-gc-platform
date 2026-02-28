-- ============================================================================
-- Trade categories: DB-backed list so we can add custom categories in-app.
-- System (built-in) categories are locked; orgs can add their own.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trade_categories (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'default-org',
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📦',
  sort_order INT NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, key)
);

CREATE INDEX IF NOT EXISTS idx_trade_categories_organization_id
  ON public.trade_categories (organization_id);

CREATE INDEX IF NOT EXISTS idx_trade_categories_sort
  ON public.trade_categories (organization_id, sort_order);

ALTER TABLE public.trade_categories ENABLE ROW LEVEL SECURITY;

-- SELECT: user sees system categories (org = 'system') or their org's categories
CREATE POLICY "Users can view system and own org trade categories"
  ON public.trade_categories FOR SELECT
  USING (
    organization_id = 'system'
    OR organization_id = get_user_organization()
  );

-- INSERT: only for own org, and only non-system (enforced by app; is_system false)
CREATE POLICY "Users can create own org trade categories"
  ON public.trade_categories FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization()
    AND is_system = false
  );

-- UPDATE: only own org and only non-system rows
CREATE POLICY "Users can update own org non-system trade categories"
  ON public.trade_categories FOR UPDATE
  USING (
    organization_id = get_user_organization()
    AND is_system = false
  )
  WITH CHECK (
    organization_id = get_user_organization()
    AND is_system = false
  );

-- DELETE: only own org and only non-system rows
CREATE POLICY "Users can delete own org non-system trade categories"
  ON public.trade_categories FOR DELETE
  USING (
    organization_id = get_user_organization()
    AND is_system = false
  );

CREATE TRIGGER update_trade_categories_updated_at
  BEFORE UPDATE ON public.trade_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed system (built-in) categories. organization_id = 'system' so all orgs see them.
INSERT INTO public.trade_categories (organization_id, key, label, icon, sort_order, is_system) VALUES
  ('system', 'planning', 'Planning', '📋', 1, true),
  ('system', 'site-prep', 'Site Prep', '🚜', 2, true),
  ('system', 'excavation-foundation', 'Excavation/Foundation', '🏗️', 3, true),
  ('system', 'utilities', 'Utilities', '⚡', 4, true),
  ('system', 'water-sewer', 'Water + Sewer', '🚰', 5, true),
  ('system', 'rough-framing', 'Rough Framing', '🔨', 6, true),
  ('system', 'windows-doors', 'Windows + Doors', '🚪', 7, true),
  ('system', 'exterior-finishes', 'Exterior Finishes', '🏘️', 8, true),
  ('system', 'roofing', 'Roofing', '🏠', 9, true),
  ('system', 'masonry-paving', 'Masonry/Paving', '🧱', 10, true),
  ('system', 'porches-decks', 'Porches + Decks', '🏡', 11, true),
  ('system', 'insulation', 'Insulation', '🧊', 12, true),
  ('system', 'plumbing', 'Plumbing', '🚰', 13, true),
  ('system', 'electrical', 'Electrical', '⚡', 14, true),
  ('system', 'hvac', 'HVAC', '❄️', 15, true),
  ('system', 'drywall', 'Drywall', '📐', 16, true),
  ('system', 'interior-finishes', 'Interior Finishes', '🎨', 17, true),
  ('system', 'kitchen', 'Kitchen', '🍳', 18, true),
  ('system', 'bath', 'Bath', '🛁', 19, true),
  ('system', 'appliances', 'Appliances', '🔌', 20, true),
  ('system', 'other', 'Other', '📦', 21, true)
ON CONFLICT (organization_id, key) DO NOTHING;

COMMENT ON TABLE public.trade_categories IS 'Trade/category list: system (built-in) rows are locked; orgs can add custom categories.';

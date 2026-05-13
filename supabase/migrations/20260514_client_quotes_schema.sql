-- Step 1: Client-facing GC quotes — schema, RLS, templates, project status.
-- Anchor: docs/QUOTE_DOCUMENT_PLAN.md §5–§7. Prefix client_quote_* (distinct from quote_requests / submitted_quotes).
--
-- Pre-flight (2026-05-14): projects.status is TEXT; live values include estimating, in-progress, complete,
-- order, project-info, quote. projects.organization_id is uuid FK to organizations (not organization_id_uuid).
-- RLS uses public.get_user_organization_uuid() per estimates pattern.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Project status CHECK (include all live values + planning default + lost)
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_status_check
  CHECK (
    status IN (
      'planning',
      'estimating',
      'in-progress',
      'complete',
      'order',
      'project-info',
      'quote',
      'lost'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. client_quotes
-- ---------------------------------------------------------------------------
CREATE TABLE public.client_quotes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  quote_number text NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  UNIQUE (organization_id, quote_number, revision),

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired', 'superseded')),

  prepared_for jsonb,
  project_address_override text,

  scope_narrative text,
  validity_days integer NOT NULL DEFAULT 60,

  issued_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,

  sent_total numeric,
  sent_pdf_url text,

  superseded_by_id uuid REFERENCES public.client_quotes(id) ON DELETE SET NULL,

  inclusions text[] NOT NULL DEFAULT '{}',
  exclusions text[] NOT NULL DEFAULT '{}',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_client_quotes_org ON public.client_quotes(organization_id);
CREATE INDEX idx_client_quotes_project ON public.client_quotes(project_id);
CREATE INDEX idx_client_quotes_status ON public.client_quotes(status);
CREATE INDEX idx_client_quotes_number ON public.client_quotes(organization_id, quote_number);

-- ---------------------------------------------------------------------------
-- 3. client_quote_line_items
-- ---------------------------------------------------------------------------
CREATE TABLE public.client_quote_line_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_quote_id uuid NOT NULL REFERENCES public.client_quotes(id) ON DELETE CASCADE,
  trade_category text NOT NULL,
  display_label text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_quote_line_items_quote ON public.client_quote_line_items(client_quote_id);

-- ---------------------------------------------------------------------------
-- 4. client_quote_options
-- ---------------------------------------------------------------------------
CREATE TABLE public.client_quote_options (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_quote_id uuid NOT NULL REFERENCES public.client_quotes(id) ON DELETE CASCADE,
  label text NOT NULL,
  description text,
  amount numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_quote_options_quote ON public.client_quote_options(client_quote_id);

-- ---------------------------------------------------------------------------
-- 6. Template tables + uniqueness for idempotent seed
-- ---------------------------------------------------------------------------
CREATE TABLE public.client_quote_inclusion_templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_type text,
  label text NOT NULL,
  items text[] NOT NULL DEFAULT '{}',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_client_quote_inclusion_templates_org_project_type
  ON public.client_quote_inclusion_templates (organization_id, project_type);

CREATE TABLE public.client_quote_exclusion_templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_type text,
  label text NOT NULL,
  items text[] NOT NULL DEFAULT '{}',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_client_quote_exclusion_templates_org_project_type
  ON public.client_quote_exclusion_templates (organization_id, project_type);

CREATE INDEX idx_inclusion_templates_org ON public.client_quote_inclusion_templates(organization_id);
CREATE INDEX idx_exclusion_templates_org ON public.client_quote_exclusion_templates(organization_id);

-- ---------------------------------------------------------------------------
-- 7. Quote number sequence (per org per year)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_client_quote_number(p_org uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM now())::int;
  v_next int;
  v_lock_key bigint;
BEGIN
  v_lock_key := hashtextextended(p_org::text || ':' || v_year::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(quote_number, '^Q-' || v_year::text || '-', ''), '')::int
  ), 0) + 1
    INTO v_next
    FROM public.client_quotes
    WHERE organization_id = p_org
      AND quote_number LIKE 'Q-' || v_year::text || '-%';

  RETURN 'Q-' || v_year::text || '-' || lpad(v_next::text, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_client_quote_number(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. RLS — client_quotes, line_items, options (estimates-style four policies)
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org client_quotes" ON public.client_quotes
  FOR SELECT USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
  );

CREATE POLICY "Editors can create client_quotes" ON public.client_quotes
  FOR INSERT WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

CREATE POLICY "Editors can update client_quotes" ON public.client_quotes
  FOR UPDATE USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

CREATE POLICY "Admins can delete client_quotes" ON public.client_quotes
  FOR DELETE USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_is_admin()
  );

ALTER TABLE public.client_quote_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org client_quote_line_items" ON public.client_quote_line_items
  FOR SELECT USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
  );

CREATE POLICY "Editors can create client_quote_line_items" ON public.client_quote_line_items
  FOR INSERT WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

CREATE POLICY "Editors can update client_quote_line_items" ON public.client_quote_line_items
  FOR UPDATE USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

CREATE POLICY "Admins can delete client_quote_line_items" ON public.client_quote_line_items
  FOR DELETE USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_is_admin()
  );

ALTER TABLE public.client_quote_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org client_quote_options" ON public.client_quote_options
  FOR SELECT USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
  );

CREATE POLICY "Editors can create client_quote_options" ON public.client_quote_options
  FOR INSERT WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

CREATE POLICY "Editors can update client_quote_options" ON public.client_quote_options
  FOR UPDATE USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

CREATE POLICY "Admins can delete client_quote_options" ON public.client_quote_options
  FOR DELETE USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_is_admin()
  );

-- Templates: SELECT editor+active; INSERT/UPDATE/DELETE admin only
ALTER TABLE public.client_quote_inclusion_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org client_quote_inclusion_templates" ON public.client_quote_inclusion_templates
  FOR SELECT USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
  );

CREATE POLICY "Admins can insert client_quote_inclusion_templates" ON public.client_quote_inclusion_templates
  FOR INSERT WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_is_admin()
  );

CREATE POLICY "Admins can update client_quote_inclusion_templates" ON public.client_quote_inclusion_templates
  FOR UPDATE USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_is_admin()
  );

CREATE POLICY "Admins can delete client_quote_inclusion_templates" ON public.client_quote_inclusion_templates
  FOR DELETE USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_is_admin()
  );

ALTER TABLE public.client_quote_exclusion_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org client_quote_exclusion_templates" ON public.client_quote_exclusion_templates
  FOR SELECT USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
  );

CREATE POLICY "Admins can insert client_quote_exclusion_templates" ON public.client_quote_exclusion_templates
  FOR INSERT WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_is_admin()
  );

CREATE POLICY "Admins can update client_quote_exclusion_templates" ON public.client_quote_exclusion_templates
  FOR UPDATE USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_is_admin()
  );

CREATE POLICY "Admins can delete client_quote_exclusion_templates" ON public.client_quote_exclusion_templates
  FOR DELETE USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_is_admin()
  );

-- ---------------------------------------------------------------------------
-- 9. updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_client_quotes_updated_at ON public.client_quotes;
CREATE TRIGGER update_client_quotes_updated_at
  BEFORE UPDATE ON public.client_quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_quote_line_items_updated_at ON public.client_quote_line_items;
CREATE TRIGGER update_client_quote_line_items_updated_at
  BEFORE UPDATE ON public.client_quote_line_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_quote_options_updated_at ON public.client_quote_options;
CREATE TRIGGER update_client_quote_options_updated_at
  BEFORE UPDATE ON public.client_quote_options
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_quote_inclusion_templates_updated_at ON public.client_quote_inclusion_templates;
CREATE TRIGGER update_client_quote_inclusion_templates_updated_at
  BEFORE UPDATE ON public.client_quote_inclusion_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_quote_exclusion_templates_updated_at ON public.client_quote_exclusion_templates;
CREATE TRIGGER update_client_quote_exclusion_templates_updated_at
  BEFORE UPDATE ON public.client_quote_exclusion_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 10. Seed default templates (commercial new-build + renovation per org)
-- ---------------------------------------------------------------------------
INSERT INTO public.client_quote_inclusion_templates
  (organization_id, project_type, label, items, is_default)
SELECT
  o.id,
  'commercial-new-build',
  'Commercial New-Build Default',
  ARRAY[
    'All labor, materials, equipment, and supervision for the scope listed above',
    'Project management and on-site supervision',
    'Standard cleanup and final broom-clean condition at substantial completion'
  ]::text[],
  true
FROM public.organizations o
ON CONFLICT (organization_id, project_type) DO NOTHING;

INSERT INTO public.client_quote_inclusion_templates
  (organization_id, project_type, label, items, is_default)
SELECT
  o.id,
  'commercial-renovation',
  'Commercial Renovation Default',
  ARRAY[
    'All labor, materials, equipment, and supervision for the scope listed above',
    'Project management and on-site supervision',
    'Standard cleanup and final broom-clean condition at substantial completion'
  ]::text[],
  true
FROM public.organizations o
ON CONFLICT (organization_id, project_type) DO NOTHING;

INSERT INTO public.client_quote_exclusion_templates
  (organization_id, project_type, label, items, is_default)
SELECT
  o.id,
  'commercial-new-build',
  'Commercial New-Build Default',
  ARRAY[
    'Permits and impact fees (by Owner)',
    'Builder''s risk insurance (by Owner)',
    'Site survey, geotechnical, and environmental testing',
    'Utility tap fees and meter installation',
    'Owner-supplied items (appliances, FF&E, AV, security)',
    'Hazardous materials abatement',
    'Unsuitable soils or rock removal',
    'Off-hours or overtime acceleration'
  ]::text[],
  true
FROM public.organizations o
ON CONFLICT (organization_id, project_type) DO NOTHING;

INSERT INTO public.client_quote_exclusion_templates
  (organization_id, project_type, label, items, is_default)
SELECT
  o.id,
  'commercial-renovation',
  'Commercial Renovation Default',
  ARRAY[
    'Permits and impact fees (by Owner)',
    'Builder''s risk insurance (by Owner)',
    'Site survey, geotechnical, and environmental testing',
    'Utility tap fees and meter installation',
    'Owner-supplied items (appliances, FF&E, AV, security)',
    'Hazardous materials abatement',
    'Unsuitable soils or rock removal',
    'Off-hours or overtime acceleration'
  ]::text[],
  true
FROM public.organizations o
ON CONFLICT (organization_id, project_type) DO NOTHING;

COMMIT;

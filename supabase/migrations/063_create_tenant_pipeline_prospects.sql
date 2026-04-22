-- ============================================================================
-- Tenant Pipeline Prospects
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_pipeline_prospects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  development TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'Grocer',
    'QSR',
    'Casual Dining',
    'Entertainment',
    'Retail',
    'Fitness',
    'Medical',
    'Other'
  )),
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  outreach_method TEXT,
  stage TEXT NOT NULL CHECK (stage IN (
    'Contacted',
    'Meeting Set',
    'Meeting Complete',
    'Proposal Sent',
    'Negotiating',
    'LOI Signed',
    'Dead'
  )),
  owner TEXT,
  next_action TEXT,
  next_action_date DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_pipeline_prospects_org
  ON public.tenant_pipeline_prospects (organization_id);

CREATE INDEX IF NOT EXISTS idx_tenant_pipeline_prospects_stage
  ON public.tenant_pipeline_prospects (organization_id, stage);

CREATE INDEX IF NOT EXISTS idx_tenant_pipeline_prospects_development
  ON public.tenant_pipeline_prospects (organization_id, development);

ALTER TABLE public.tenant_pipeline_prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view tenant pipeline prospects" ON public.tenant_pipeline_prospects;
CREATE POLICY "Users can view tenant pipeline prospects"
  ON public.tenant_pipeline_prospects FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

DROP POLICY IF EXISTS "Editors and admins can create tenant pipeline prospects" ON public.tenant_pipeline_prospects;
CREATE POLICY "Editors and admins can create tenant pipeline prospects"
  ON public.tenant_pipeline_prospects FOR INSERT
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Editors and admins can update tenant pipeline prospects" ON public.tenant_pipeline_prospects;
CREATE POLICY "Editors and admins can update tenant pipeline prospects"
  ON public.tenant_pipeline_prospects FOR UPDATE
  USING (organization_id = get_user_organization() AND user_can_edit())
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Editors and admins can delete tenant pipeline prospects" ON public.tenant_pipeline_prospects;
CREATE POLICY "Editors and admins can delete tenant pipeline prospects"
  ON public.tenant_pipeline_prospects FOR DELETE
  USING (organization_id = get_user_organization() AND user_can_edit());

DROP TRIGGER IF EXISTS update_tenant_pipeline_prospects_updated_at ON public.tenant_pipeline_prospects;
CREATE TRIGGER update_tenant_pipeline_prospects_updated_at
  BEFORE UPDATE ON public.tenant_pipeline_prospects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.tenant_pipeline_prospects IS 'Tenant prospect tracking pipeline for each organization.';

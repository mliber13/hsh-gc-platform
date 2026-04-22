-- ============================================================================
-- Tenant Pipeline RLS: allow active org users to manage prospects
-- ============================================================================

DROP POLICY IF EXISTS "Editors and admins can create tenant pipeline prospects" ON public.tenant_pipeline_prospects;
DROP POLICY IF EXISTS "Editors and admins can update tenant pipeline prospects" ON public.tenant_pipeline_prospects;
DROP POLICY IF EXISTS "Editors and admins can delete tenant pipeline prospects" ON public.tenant_pipeline_prospects;

CREATE POLICY "Active users can create tenant pipeline prospects"
  ON public.tenant_pipeline_prospects FOR INSERT
  WITH CHECK (organization_id = get_user_organization() AND is_user_active());

CREATE POLICY "Active users can update tenant pipeline prospects"
  ON public.tenant_pipeline_prospects FOR UPDATE
  USING (organization_id = get_user_organization() AND is_user_active())
  WITH CHECK (organization_id = get_user_organization() AND is_user_active());

CREATE POLICY "Active users can delete tenant pipeline prospects"
  ON public.tenant_pipeline_prospects FOR DELETE
  USING (organization_id = get_user_organization() AND is_user_active());

-- ============================================================================
-- Tenant Pipeline RLS - align with current UUID-based schema
-- ============================================================================
-- This DB skipped the legacy TEXT-to-UUID bridge transition (organization_text_map,
-- organization_id_uuid columns, etc. don't exist here). Both profiles.organization_id
-- and tenant_pipeline_prospects.organization_id are UUID columns from the start.
--
-- The 4 policies created by migrations 063 + 066 reference get_user_organization()
-- which doesn't exist on this DB, making all SELECT/INSERT/UPDATE/DELETE fail or
-- behave inconsistently. Replace with policies using current_user_organization_id()
-- (returns uuid, queries profiles.organization_id directly).

BEGIN;

-- Drop everything that might be there (legacy names + new names + any in-between)
DROP POLICY IF EXISTS "Users can view tenant pipeline prospects" ON public.tenant_pipeline_prospects;
DROP POLICY IF EXISTS "Editors and admins can create tenant pipeline prospects" ON public.tenant_pipeline_prospects;
DROP POLICY IF EXISTS "Editors and admins can update tenant pipeline prospects" ON public.tenant_pipeline_prospects;
DROP POLICY IF EXISTS "Editors and admins can delete tenant pipeline prospects" ON public.tenant_pipeline_prospects;
DROP POLICY IF EXISTS "Active users can create tenant pipeline prospects" ON public.tenant_pipeline_prospects;
DROP POLICY IF EXISTS "Active users can update tenant pipeline prospects" ON public.tenant_pipeline_prospects;
DROP POLICY IF EXISTS "Active users can delete tenant pipeline prospects" ON public.tenant_pipeline_prospects;

CREATE POLICY "Users can view tenant pipeline prospects"
  ON public.tenant_pipeline_prospects FOR SELECT
  USING (
    organization_id = public.current_user_organization_id()
    AND public.is_user_active()
  );

CREATE POLICY "Active users can create tenant pipeline prospects"
  ON public.tenant_pipeline_prospects FOR INSERT
  WITH CHECK (
    organization_id = public.current_user_organization_id()
    AND public.is_user_active()
  );

CREATE POLICY "Active users can update tenant pipeline prospects"
  ON public.tenant_pipeline_prospects FOR UPDATE
  USING (
    organization_id = public.current_user_organization_id()
    AND public.is_user_active()
  )
  WITH CHECK (
    organization_id = public.current_user_organization_id()
    AND public.is_user_active()
  );

CREATE POLICY "Active users can delete tenant pipeline prospects"
  ON public.tenant_pipeline_prospects FOR DELETE
  USING (
    organization_id = public.current_user_organization_id()
    AND public.is_user_active()
  );

COMMIT;

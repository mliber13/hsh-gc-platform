-- ============================================================================
-- Tenant pipeline audit defaults
-- ============================================================================

ALTER TABLE public.tenant_pipeline_prospects
  ALTER COLUMN created_by SET DEFAULT auth.uid();

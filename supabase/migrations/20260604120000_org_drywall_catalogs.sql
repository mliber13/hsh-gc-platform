-- Phase Q.A — org_drywall_catalogs (mirror org_team: one JSONB payload row per org)

BEGIN;

CREATE TABLE IF NOT EXISTS public.org_drywall_catalogs (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_drywall_catalogs_organization_id_unique UNIQUE (organization_id)
);

COMMENT ON TABLE public.org_drywall_catalogs IS
  'Org-scoped drywall quote catalogs (boards, finish scopes, component rates) — single payload JSONB per org.';

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_can_read_drywall_catalogs(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_rbac_role(
    ARRAY['owner', 'office_gc', 'office_drywall', 'viewer']::text[],
    uid
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_write_drywall_catalogs(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_rbac_role(
    ARRAY['owner', 'office_drywall']::text[],
    uid
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_read_drywall_catalogs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_write_drywall_catalogs(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS policies (mirror org_team_hr_* pattern)
-- ---------------------------------------------------------------------------
ALTER TABLE public.org_drywall_catalogs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_drywall_catalogs_select ON public.org_drywall_catalogs;
CREATE POLICY org_drywall_catalogs_select ON public.org_drywall_catalogs
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_read_drywall_catalogs()
  );

DROP POLICY IF EXISTS org_drywall_catalogs_insert ON public.org_drywall_catalogs;
CREATE POLICY org_drywall_catalogs_insert ON public.org_drywall_catalogs
  FOR INSERT
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_write_drywall_catalogs()
  );

DROP POLICY IF EXISTS org_drywall_catalogs_update ON public.org_drywall_catalogs;
CREATE POLICY org_drywall_catalogs_update ON public.org_drywall_catalogs
  FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_write_drywall_catalogs()
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_write_drywall_catalogs()
  );

DROP POLICY IF EXISTS org_drywall_catalogs_delete ON public.org_drywall_catalogs;
CREATE POLICY org_drywall_catalogs_delete ON public.org_drywall_catalogs
  FOR DELETE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_write_drywall_catalogs()
  );

COMMIT;

-- QB.3 — synced QuickBooks vendor material costs matched to drywall projects

BEGIN;

CREATE TABLE IF NOT EXISTS public.drywall_qb_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  qb_transaction_id text NOT NULL,
  qb_transaction_type text,
  qb_line_id text NOT NULL DEFAULT '',
  vendor_name text,
  qb_job_name text,
  doc_number text,
  txn_date date,
  amount numeric NOT NULL DEFAULT 0,
  matched_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  review_status text NOT NULL DEFAULT 'accepted' CHECK (review_status IN ('pending', 'accepted', 'rejected')),
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, qb_transaction_id, qb_line_id)
);

CREATE INDEX IF NOT EXISTS drywall_qb_materials_org_id_idx
  ON public.drywall_qb_materials (organization_id);

CREATE INDEX IF NOT EXISTS drywall_qb_materials_matched_project_id_idx
  ON public.drywall_qb_materials (matched_project_id)
  WHERE matched_project_id IS NOT NULL;

COMMENT ON TABLE public.drywall_qb_materials IS
  'QuickBooks vendor material transactions synced and name-matched to drywall projects for cost review (QB.3).';

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_can_read_drywall_qb_materials(uid uuid DEFAULT auth.uid())
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

CREATE OR REPLACE FUNCTION public.user_can_write_drywall_qb_materials(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.user_has_rbac_role(ARRAY['owner', 'office_drywall']::text[], uid)
    OR COALESCE(
      (SELECT p.can_admin_qb FROM public.profiles p WHERE p.id = uid),
      false
    );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_read_drywall_qb_materials(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_write_drywall_qb_materials(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.drywall_qb_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drywall_qb_materials_select ON public.drywall_qb_materials;
CREATE POLICY drywall_qb_materials_select ON public.drywall_qb_materials
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_read_drywall_qb_materials()
  );

DROP POLICY IF EXISTS drywall_qb_materials_insert ON public.drywall_qb_materials;
CREATE POLICY drywall_qb_materials_insert ON public.drywall_qb_materials
  FOR INSERT
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_write_drywall_qb_materials()
  );

DROP POLICY IF EXISTS drywall_qb_materials_update ON public.drywall_qb_materials;
CREATE POLICY drywall_qb_materials_update ON public.drywall_qb_materials
  FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_write_drywall_qb_materials()
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_write_drywall_qb_materials()
  );

DROP POLICY IF EXISTS drywall_qb_materials_delete ON public.drywall_qb_materials;
CREATE POLICY drywall_qb_materials_delete ON public.drywall_qb_materials
  FOR DELETE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_write_drywall_qb_materials()
  );

COMMIT;

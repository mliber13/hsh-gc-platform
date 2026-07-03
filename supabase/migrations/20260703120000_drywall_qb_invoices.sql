-- QB.1 — synced QuickBooks invoices matched to drywall projects (revenue review)

BEGIN;

CREATE TABLE IF NOT EXISTS public.drywall_qb_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  qb_invoice_id text NOT NULL,
  qb_customer_name text,
  qb_job_name text,
  doc_number text,
  txn_date date,
  total_amt numeric NOT NULL DEFAULT 0,
  balance numeric NOT NULL DEFAULT 0,
  matched_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  review_status text NOT NULL DEFAULT 'accepted' CHECK (review_status IN ('accepted', 'rejected')),
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, qb_invoice_id)
);

CREATE INDEX IF NOT EXISTS drywall_qb_invoices_org_id_idx
  ON public.drywall_qb_invoices (organization_id);

CREATE INDEX IF NOT EXISTS drywall_qb_invoices_matched_project_id_idx
  ON public.drywall_qb_invoices (matched_project_id)
  WHERE matched_project_id IS NOT NULL;

COMMENT ON TABLE public.drywall_qb_invoices IS
  'QuickBooks customer invoices synced and name-matched to drywall projects for revenue review (QB.1).';

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_can_read_drywall_qb_invoices(uid uuid DEFAULT auth.uid())
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

CREATE OR REPLACE FUNCTION public.user_can_write_drywall_qb_invoices(uid uuid DEFAULT auth.uid())
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

GRANT EXECUTE ON FUNCTION public.user_can_read_drywall_qb_invoices(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_write_drywall_qb_invoices(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.drywall_qb_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drywall_qb_invoices_select ON public.drywall_qb_invoices;
CREATE POLICY drywall_qb_invoices_select ON public.drywall_qb_invoices
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_read_drywall_qb_invoices()
  );

DROP POLICY IF EXISTS drywall_qb_invoices_insert ON public.drywall_qb_invoices;
CREATE POLICY drywall_qb_invoices_insert ON public.drywall_qb_invoices
  FOR INSERT
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_write_drywall_qb_invoices()
  );

DROP POLICY IF EXISTS drywall_qb_invoices_update ON public.drywall_qb_invoices;
CREATE POLICY drywall_qb_invoices_update ON public.drywall_qb_invoices
  FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_write_drywall_qb_invoices()
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_write_drywall_qb_invoices()
  );

DROP POLICY IF EXISTS drywall_qb_invoices_delete ON public.drywall_qb_invoices;
CREATE POLICY drywall_qb_invoices_delete ON public.drywall_qb_invoices
  FOR DELETE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_write_drywall_qb_invoices()
  );

COMMIT;

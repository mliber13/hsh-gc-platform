BEGIN;

-- Supplier view P3: per-supplier no-login share link. A long random token = the capability.
-- The token is NEVER exposed to anon at the table level — a public edge function validates it
-- with the service role. This table has office-only RLS; anon has no access (avoids the
-- USING(true) anon-leak pattern flagged in the Batch A audit).

CREATE TABLE IF NOT EXISTS public.supplier_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_share_links_token
  ON public.supplier_share_links(token)
  WHERE revoked_at IS NULL;

ALTER TABLE public.supplier_share_links ENABLE ROW LEVEL SECURITY;

-- Office manages links; NO anon/authenticated-outside-org access. The public page never reads
-- this table directly — the edge function (service role) does, after validating the token.
DROP POLICY IF EXISTS "Editors manage supplier share links" ON public.supplier_share_links;
CREATE POLICY "Editors manage supplier share links" ON public.supplier_share_links
  FOR ALL
  USING (organization_id = public.get_user_organization_uuid() AND public.user_can_edit())
  WITH CHECK (organization_id = public.get_user_organization_uuid() AND public.user_can_edit());

COMMENT ON TABLE public.supplier_share_links IS
  'CC/P3: per-supplier capability token for the no-login supplier order share page. Validated only via the service-role edge function.';

-- Read side for the share page: given a valid token, return that supplier's active orders
-- (status sent/confirmed/partial) with the schedule-resolved delivery date. SECURITY DEFINER +
-- token validated inside; granted ONLY to service_role (the edge function), never anon.
CREATE OR REPLACE FUNCTION public.supplier_share_orders(p_token text)
RETURNS TABLE (
  supplier_name text,
  project_id uuid,
  project_name text,
  order_json jsonb,
  delivery_date text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supplier uuid;
  v_org uuid;
  v_supplier_name text;
BEGIN
  SELECT sl.supplier_id, sl.organization_id
    INTO v_supplier, v_org
  FROM public.supplier_share_links sl
  WHERE sl.token = p_token AND sl.revoked_at IS NULL
  LIMIT 1;

  IF v_supplier IS NULL THEN RETURN; END IF;

  SELECT s.name INTO v_supplier_name FROM public.suppliers s WHERE s.id = v_supplier;

  RETURN QUERY
  SELECT
    v_supplier_name,
    p.id,
    p.name,
    o.elem,
    COALESCE(si.start_date::text, NULLIF(trim(o.elem->>'deliveryDate'), ''))
  FROM public.projects p
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(p.metadata->'legacy'->'orders') = 'array'
         THEN p.metadata->'legacy'->'orders'
         ELSE '[]'::jsonb END
  ) AS o(elem)
  LEFT JOIN public.schedule_items si
    ON si.id::text = NULLIF(trim(o.elem->>'scheduleItemId'), '')
  WHERE p.organization_id = v_org
    AND o.elem->>'supplierId' = v_supplier::text
    AND COALESCE(o.elem->>'status', 'draft') IN ('sent', 'confirmed', 'partial');
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_share_orders(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_share_orders(text) TO service_role;

COMMIT;

BEGIN;

-- Customer comms — customer/GC-super schedule share link (no-login).
-- Per-customer capability token (keyed by phone) → their projects' schedules + request-a-change.
-- Mirrors supplier_share_links security: office-only RLS, no anon table access; the token is
-- validated only inside the service-role edge function.

CREATE TABLE IF NOT EXISTS public.customer_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_phone text NOT NULL, -- normalized 10-digit (the customer/super cell)
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (organization_id, contact_phone)
);

CREATE INDEX IF NOT EXISTS idx_customer_share_links_token
  ON public.customer_share_links(token)
  WHERE revoked_at IS NULL;

ALTER TABLE public.customer_share_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Editors manage customer share links" ON public.customer_share_links;
CREATE POLICY "Editors manage customer share links" ON public.customer_share_links
  FOR ALL
  USING (organization_id = public.get_user_organization_uuid() AND public.user_can_edit())
  WITH CHECK (organization_id = public.get_user_organization_uuid() AND public.user_can_edit());

COMMENT ON TABLE public.customer_share_links IS
  'Customer comms: per-customer (per-phone) capability token for the no-login schedule share page. Validated only via the service-role edge function.';

-- Curated schedule for the customer's projects (name + dates + status only — no crew/tasks/pay).
-- SECURITY DEFINER + token validated inside; service_role only, never anon.
CREATE OR REPLACE FUNCTION public.customer_share_schedule(p_token text)
RETURNS TABLE (
  contact_name text,
  project_id uuid,
  project_name text,
  item_id uuid,
  item_name text,
  start_date text,
  end_date text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_org uuid;
  v_name text;
BEGIN
  SELECT csl.contact_phone, csl.organization_id
    INTO v_phone, v_org
  FROM public.customer_share_links csl
  WHERE csl.token = p_token AND csl.revoked_at IS NULL
  LIMIT 1;

  IF v_phone IS NULL THEN RETURN; END IF;

  SELECT cpc.contact_name INTO v_name
  FROM public.customer_project_contacts cpc
  WHERE cpc.organization_id = v_org AND cpc.contact_phone = v_phone
  LIMIT 1;

  RETURN QUERY
  SELECT
    v_name,
    p.id,
    p.name,
    si.id,
    si.name,
    si.start_date::text,
    si.end_date::text,
    si.status
  FROM public.customer_project_contacts cpc
  JOIN public.projects p ON p.id = cpc.project_id
  LEFT JOIN public.schedule_items si
    ON si.project_id = p.id AND si.organization_id = v_org
  WHERE cpc.organization_id = v_org
    AND cpc.contact_phone = v_phone
  ORDER BY p.name, si.start_date NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.customer_share_schedule(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_share_schedule(text) TO service_role;

COMMIT;

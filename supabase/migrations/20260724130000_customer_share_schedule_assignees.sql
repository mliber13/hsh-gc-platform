-- Customer schedule share: include who's assigned to each step (raw member ids; the edge
-- function resolves them to names from the org_team roster). Return-type change → drop+recreate.

DROP FUNCTION IF EXISTS public.customer_share_schedule(text);

CREATE FUNCTION public.customer_share_schedule(p_token text)
RETURNS TABLE (
  contact_name text,
  project_id uuid,
  project_name text,
  item_id uuid,
  item_name text,
  start_date text,
  end_date text,
  status text,
  assigned_persons text[]
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
    si.status,
    si.assigned_persons
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

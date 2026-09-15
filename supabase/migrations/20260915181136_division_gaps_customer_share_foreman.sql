-- Schedule unification Step 3a: close division gaps before the Goodwill Multi seed.
-- 1. customer_share_schedule is an unauthenticated drywall portal — filter to drywall.
-- 2. foreman_create_schedule_item is the drywall foreman path — stamp division explicitly.

BEGIN;

-- Gap 1. Customer share links have no notion of division. Filtering to drywall is
-- right today (the portal exists to show a drywall customer their drywall dates)
-- and is the safe default for a no-login link. It is not a permanent product
-- answer: on a job where HSH is both GC and drywall, the building owner might
-- reasonably be entitled to the GC schedule too. Do not "fix" this by removing
-- the filter — that decision belongs in a later step, not here.
-- Return type unchanged → CREATE OR REPLACE, no drop/recreate.

CREATE OR REPLACE FUNCTION public.customer_share_schedule(p_token text)
RETURNS TABLE (
  contact_name text,
  project_id uuid,
  project_name text,
  project_client jsonb,
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
    to_jsonb(p.client),
    si.id,
    si.name,
    si.start_date::text,
    si.end_date::text,
    si.status,
    si.assigned_persons
  FROM public.customer_project_contacts cpc
  JOIN public.projects p ON p.id = cpc.project_id
  LEFT JOIN public.schedule_items si
    ON si.project_id = p.id
   AND si.organization_id = v_org
   AND si.division = 'drywall'
  WHERE cpc.organization_id = v_org
    AND cpc.contact_phone = v_phone
  ORDER BY p.name, si.start_date NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.customer_share_schedule(text) IS
  'Unauthenticated drywall customer portal. Joins schedule_items with division = drywall because customer_share_links has no division and this surface exists to show drywall dates. On a dual-role job the owner might also be entitled to the GC schedule — that is a product decision, not a reason to drop this filter.';

REVOKE ALL ON FUNCTION public.customer_share_schedule(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_share_schedule(text) TO service_role;

-- Gap 2. This RPC is the drywall foreman path. Stamp division explicitly
-- rather than inheriting the column default — the value carries meaning.

CREATE OR REPLACE FUNCTION public.foreman_create_schedule_item(
  p_project_id uuid,
  p_item jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_schedule_id uuid;
  v_item_id uuid;
  v_name text;
  v_type text;
  v_start date;
  v_end date;
  v_status text;
  v_duration int;
  v_assigned text[];
  v_notes text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  v_org := public.get_user_organization_uuid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organization';
  END IF;
  IF NOT public.user_has_crew_role(v_uid) OR NOT public.user_is_field_foreman(v_uid) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id
      AND p.organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'project not found';
  END IF;

  v_name := NULLIF(trim(p_item->>'name'), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'name is required';
  END IF;

  v_type := COALESCE(NULLIF(trim(p_item->>'type'), ''), 'field');
  IF v_type NOT IN ('field', 'office') THEN
    v_type := 'field';
  END IF;

  v_start := NULLIF(trim(p_item->>'start_date'), '')::date;
  v_end := NULLIF(trim(COALESCE(p_item->>'end_date', p_item->>'start_date')), '')::date;
  IF v_start IS NULL OR v_end IS NULL THEN
    RAISE EXCEPTION 'start_date and end_date are required';
  END IF;
  IF v_end < v_start THEN
    RAISE EXCEPTION 'end_date before start_date';
  END IF;

  v_status := COALESCE(NULLIF(trim(p_item->>'status'), ''), 'not-started');
  IF v_status NOT IN ('not-started', 'in-progress', 'complete', 'delayed') THEN
    v_status := 'not-started';
  END IF;

  v_duration := COALESCE(NULLIF(p_item->>'duration', '')::int, 1);
  IF v_duration < 1 THEN
    v_duration := 1;
  END IF;

  IF jsonb_typeof(p_item->'assigned_persons') = 'array' THEN
    SELECT COALESCE(array_agg(x), ARRAY[]::text[])
    INTO v_assigned
    FROM jsonb_array_elements_text(p_item->'assigned_persons') AS t(x)
    WHERE trim(x) <> '';
  ELSE
    v_assigned := ARRAY[]::text[];
  END IF;

  v_notes := NULLIF(trim(p_item->>'notes'), '');

  -- Find-or-create the project's schedule (schedules.user_id is NOT NULL — use the caller).
  SELECT id INTO v_schedule_id
  FROM public.schedules
  WHERE project_id = p_project_id
  LIMIT 1;

  IF v_schedule_id IS NULL THEN
    INSERT INTO public.schedules (project_id, user_id, organization_id, start_date, end_date)
    VALUES (p_project_id, v_uid, v_org, CURRENT_DATE, CURRENT_DATE + 90)
    RETURNING id INTO v_schedule_id;
  END IF;

  -- Drywall foreman path: stamp division explicitly. Do not rely on the column default.
  INSERT INTO public.schedule_items (
    schedule_id, project_id, organization_id, type, name,
    start_date, end_date, duration, status,
    assigned_persons, show_job_info_person_ids, notes,
    division
  ) VALUES (
    v_schedule_id, p_project_id, v_org, v_type, v_name,
    v_start, v_end, v_duration, v_status,
    v_assigned, v_assigned, v_notes,
    'drywall'
  )
  RETURNING id INTO v_item_id;

  RETURN v_item_id;
END;
$$;

COMMENT ON FUNCTION public.foreman_create_schedule_item(uuid, jsonb) IS
  'Drywall foreman create path. Always stamps schedule_items.division = drywall explicitly.';

REVOKE ALL ON FUNCTION public.foreman_create_schedule_item(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.foreman_create_schedule_item(uuid, jsonb) TO authenticated;

COMMIT;

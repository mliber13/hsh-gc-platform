-- Field Foreman schedule batch write + cost-free team roster for assignee picker.
-- Cascade is computed client-side (cascadeSchedule); this RPC authorizes + persists.

BEGIN;

-- Roster names only (no rates) for foreman AssignedPersonsPicker.
CREATE OR REPLACE FUNCTION public.list_org_team_roster_for_foreman()
RETURNS TABLE (
  id text,
  name text,
  kind text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  v_org := public.get_user_organization_uuid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organization';
  END IF;
  IF NOT (
    public.user_can_edit()
    OR (public.user_has_crew_role(v_uid) AND public.user_is_field_foreman(v_uid))
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    elem->>'id',
    COALESCE(NULLIF(trim(elem->>'name'), ''), 'Unknown'),
    'employee'::text
  FROM public.org_team ot,
       jsonb_array_elements(COALESCE(ot.payload->'employees', '[]'::jsonb)) elem
  WHERE ot.organization_id = v_org
    AND COALESCE(elem->>'id', '') <> ''
    AND COALESCE((elem->>'archived')::boolean, false) IS NOT TRUE
    AND COALESCE(elem->>'status', '') IS DISTINCT FROM 'archived'

  UNION ALL

  SELECT
    elem->>'id',
    COALESCE(NULLIF(trim(elem->>'name'), ''), 'Unknown'),
    'contractor'::text
  FROM public.org_team ot,
       jsonb_array_elements(COALESCE(ot.payload->'contractors1099', '[]'::jsonb)) elem
  WHERE ot.organization_id = v_org
    AND COALESCE(elem->>'id', '') <> ''
    AND COALESCE((elem->>'archived')::boolean, false) IS NOT TRUE
    AND COALESCE(elem->>'status', '') IS DISTINCT FROM 'archived';
END;
$$;

REVOKE ALL ON FUNCTION public.list_org_team_roster_for_foreman() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_org_team_roster_for_foreman() TO authenticated;

CREATE OR REPLACE FUNCTION public.foreman_apply_schedule_changes(
  p_project_id uuid,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_item jsonb;
  v_id uuid;
  v_start date;
  v_end date;
  v_status text;
  v_duration int;
  v_assigned text[];
  v_predecessors jsonb;
  v_updated int := 0;
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

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty array';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_id := (v_item->>'id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid schedule item id';
    END;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'schedule item id is required';
    END IF;

    v_start := NULLIF(trim(v_item->>'start_date'), '')::date;
    v_end := NULLIF(trim(COALESCE(v_item->>'end_date', v_item->>'start_date')), '')::date;
    IF v_start IS NULL OR v_end IS NULL THEN
      RAISE EXCEPTION 'start_date and end_date are required for item %', v_id;
    END IF;
    IF v_end < v_start THEN
      RAISE EXCEPTION 'end_date before start_date for item %', v_id;
    END IF;

    v_status := COALESCE(NULLIF(trim(v_item->>'status'), ''), 'not-started');
    IF v_status NOT IN ('not-started', 'in-progress', 'complete', 'delayed') THEN
      v_status := 'not-started';
    END IF;

    v_duration := COALESCE(NULLIF(v_item->>'duration', '')::int, 1);
    IF v_duration < 1 THEN
      v_duration := 1;
    END IF;

    IF jsonb_typeof(v_item->'assigned_persons') = 'array' THEN
      SELECT COALESCE(array_agg(x), ARRAY[]::text[])
      INTO v_assigned
      FROM jsonb_array_elements_text(v_item->'assigned_persons') AS t(x)
      WHERE trim(x) <> '';
    ELSE
      v_assigned := NULL;
    END IF;

    IF jsonb_typeof(v_item->'predecessors') = 'array' THEN
      v_predecessors := v_item->'predecessors';
    ELSE
      v_predecessors := NULL;
    END IF;

    UPDATE public.schedule_items si
    SET
      start_date = v_start,
      end_date = v_end,
      status = v_status,
      duration = v_duration,
      assigned_persons = COALESCE(v_assigned, si.assigned_persons),
      predecessors = COALESCE(v_predecessors, si.predecessors),
      updated_at = now()
    WHERE si.id = v_id
      AND si.project_id = p_project_id
      AND si.organization_id = v_org;

    IF FOUND THEN
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'no schedule items updated';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.foreman_apply_schedule_changes(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.foreman_apply_schedule_changes(uuid, jsonb) TO authenticated;

COMMIT;

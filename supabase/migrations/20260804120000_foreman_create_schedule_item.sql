-- Field Foreman: create a NEW schedule item.
-- INSERT counterpart to foreman_apply_schedule_changes (which is UPDATE-only).
-- Same authorization: crew role + is_field_foreman + project in caller's org.
-- Find-or-creates the project's schedule (mirrors getOrCreateScheduleForProject).
-- New items are created standalone (no predecessors) — dependencies stay office-managed.

BEGIN;

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

  -- Only NOT-NULL-without-default columns are set explicitly; the rest use table defaults.
  INSERT INTO public.schedule_items (
    schedule_id, project_id, organization_id, type, name,
    start_date, end_date, duration, status,
    assigned_persons, show_job_info_person_ids, notes
  ) VALUES (
    v_schedule_id, p_project_id, v_org, v_type, v_name,
    v_start, v_end, v_duration, v_status,
    v_assigned, v_assigned, v_notes
  )
  RETURNING id INTO v_item_id;

  RETURN v_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.foreman_create_schedule_item(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.foreman_create_schedule_item(uuid, jsonb) TO authenticated;

COMMIT;

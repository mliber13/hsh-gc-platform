-- Let the field foreman rename a schedule item from the mobile edit sheet.
--
-- The foreman could already NAME an item when creating one
-- (foreman_create_schedule_item), but foreman_apply_schedule_changes never wrote
-- the name column, so renaming afterwards was impossible — and the edit sheet
-- showed the name only as a read-only title, giving no hint why. Operators can
-- rename in the desktop dialog, so this closes a parity gap rather than granting
-- a new kind of authority.
--
-- Applied only when the batch item carries a non-blank 'name' (present →
-- authoritative; absent or blank → left unchanged), matching how notes and tasks
-- already behave. Cascaded sibling rows echo their existing name, so they no-op.
--
-- Signature and return type are unchanged (uuid, jsonb) → void, so CREATE OR
-- REPLACE is safe here; there is no OUT-parameter row type to conflict.
--
-- Callers are warned client-side before saving when a rename would change the
-- item's billing-draw status or its phase — see lib/drywall/scheduleItemNameMeaning.ts.

BEGIN;

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
  v_has_notes boolean;
  v_notes text;
  v_has_tasks boolean;
  v_tasks jsonb;
  v_has_name boolean;
  v_name text;
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

    v_has_notes := (v_item ? 'notes');
    v_notes := NULLIF(trim(v_item->>'notes'), '');

    v_has_tasks := (v_item ? 'tasks') AND jsonb_typeof(v_item->'tasks') = 'array';
    v_tasks := CASE WHEN v_has_tasks THEN v_item->'tasks' ELSE NULL END;

    -- A blank name is never applied: the column is the item's identity and the
    -- UI requires it, so treat blank as "not supplied" rather than clearing it.
    v_name := NULLIF(trim(v_item->>'name'), '');
    v_has_name := (v_item ? 'name') AND v_name IS NOT NULL;

    UPDATE public.schedule_items si
    SET
      name = CASE WHEN v_has_name THEN v_name ELSE si.name END,
      start_date = v_start,
      end_date = v_end,
      status = v_status,
      duration = v_duration,
      assigned_persons = COALESCE(v_assigned, si.assigned_persons),
      predecessors = COALESCE(v_predecessors, si.predecessors),
      notes = CASE WHEN v_has_notes THEN v_notes ELSE si.notes END,
      tasks = CASE WHEN v_has_tasks THEN v_tasks ELSE si.tasks END,
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

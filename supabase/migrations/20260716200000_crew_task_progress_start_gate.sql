-- Crew time clock / job progress — gate task progress to items that have STARTED.
--
-- Prevents crew from logging progress (and later generating pay) on a future-scheduled
-- schedule item before its work window begins. Replaces crew_update_task_progress with an
-- added `start_date <= current_date` check. UI disables future items too, but this is the
-- authoritative server-side enforcement.

CREATE OR REPLACE FUNCTION public.crew_update_task_progress(
  p_schedule_item_id uuid,
  p_task_id text,
  p_pct numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_person text;
  v_project uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_pct IS NULL OR p_pct < 0 OR p_pct > 100 THEN
    RAISE EXCEPTION 'pct must be between 0 and 100';
  END IF;

  v_org := public.get_user_organization_uuid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organization';
  END IF;

  IF NOT public.user_has_crew_role(v_uid) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(p.linked_employee_id, p.linked_contractor_id)
    INTO v_person
    FROM public.profiles p
    WHERE p.id = v_uid;
  IF v_person IS NULL OR v_person = '' THEN
    RAISE EXCEPTION 'crew account not linked to a team member';
  END IF;

  -- Caller must be assigned to this schedule item (in their org), the task must exist on it,
  -- AND the item must have started (no logging progress on future-scheduled work).
  SELECT si.project_id
    INTO v_project
    FROM public.schedule_items si
    WHERE si.id = p_schedule_item_id
      AND si.organization_id = v_org
      AND v_person = ANY(si.assigned_persons)
      AND si.start_date::date <= current_date
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(si.tasks) t
        WHERE t->>'id' = p_task_id
      );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized to update this task (not assigned, task missing, or job not started)';
  END IF;

  INSERT INTO public.task_progress
    (organization_id, schedule_item_id, project_id, task_id, person_id, pct, updated_at)
  VALUES (v_org, p_schedule_item_id, v_project, p_task_id, v_person, p_pct, now())
  ON CONFLICT (schedule_item_id, task_id, person_id)
  DO UPDATE SET pct = EXCLUDED.pct, updated_at = now();
END;
$$;

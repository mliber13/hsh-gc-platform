-- P1-DATE-3 — a clock-in has to be a live assignment, and only one open punch.
--
-- crew_clock_in already refuses a second open punch ('already clocked in').
-- That check stays. What it did not do is care whether the assignment is
-- current: any schedule row the person was ever on, including a job that
-- ended months ago, was enough.
--
-- "Current" means the item's end date is within the last week in
-- America/New_York, or still ahead. A week rather than zero because return
-- trips are normal — a pointup makes about two per job — and they happen after
-- the scheduled item has ended. A historical assignment raises 'no current
-- assignment' instead of 'not assigned', so the client can say the job isn't on
-- the current schedule.
--
-- The partial unique index is the race the EXISTS check cannot close, and it
-- covers the operator Time Clock insert (hrTimeService.clockIn), which does
-- not go through this RPC. No person currently has two open punches, so the
-- index builds cleanly.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_open_punch_per_person
  ON public.time_entries (organization_id, person_id)
  WHERE clock_out IS NULL;

CREATE OR REPLACE FUNCTION public.crew_clock_in(p_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_person text;
  v_person_type text;
  v_person_name text;
  v_project_name text;
  v_entry_id uuid;
  v_today date := (now() AT TIME ZONE 'America/New_York')::date;
  -- One week, everyone. Mark's call 2026-09-28: a pointup makes roughly two return
  -- trips per job and they land after the scheduled item has ended, so a zero grace
  -- would refuse the clock-in on exactly the visits the schedule does not model.
  -- Measurers no longer need their own rule.
  v_grace int := 7;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  v_org := public.get_user_organization_uuid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organization';
  END IF;
  IF NOT public.user_has_crew_role(v_uid) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT
    COALESCE(NULLIF(p.linked_employee_id, ''), NULLIF(p.linked_contractor_id, '')),
    CASE
      WHEN p.linked_employee_id IS NOT NULL AND p.linked_employee_id <> '' THEN 'w2'
      ELSE '1099'
    END
  INTO v_person, v_person_type
  FROM public.profiles p
  WHERE p.id = v_uid;
  IF v_person IS NULL OR v_person = '' THEN
    RAISE EXCEPTION 'crew account not linked to a team member';
  END IF;

  -- Ever assigned, vs assigned to something that is still live.
  IF NOT EXISTS (
    SELECT 1 FROM public.schedule_items si
    WHERE si.project_id = p_project_id
      AND si.organization_id = v_org
      AND v_person = ANY(si.assigned_persons)
  ) THEN
    RAISE EXCEPTION 'not assigned to this job';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.schedule_items si
    WHERE si.project_id = p_project_id
      AND si.organization_id = v_org
      AND v_person = ANY(si.assigned_persons)
      AND COALESCE(si.end_date, si.start_date) >= (v_today - v_grace)
  ) THEN
    RAISE EXCEPTION 'no current assignment';
  END IF;

  -- One open punch per person. The unique index above is the same rule for
  -- a concurrent insert that slips past this check.
  IF EXISTS (
    SELECT 1 FROM public.time_entries te
    WHERE te.organization_id = v_org
      AND te.person_id = v_person
      AND te.clock_out IS NULL
  ) THEN
    RAISE EXCEPTION 'already clocked in';
  END IF;

  v_person_name := COALESCE(
    (SELECT elem->>'name' FROM public.org_team ot, jsonb_array_elements(ot.payload->'employees') elem
       WHERE ot.organization_id = v_org AND elem->>'id' = v_person LIMIT 1),
    (SELECT elem->>'name' FROM public.org_team ot, jsonb_array_elements(ot.payload->'contractors1099') elem
       WHERE ot.organization_id = v_org AND elem->>'id' = v_person LIMIT 1)
  );
  SELECT name INTO v_project_name FROM public.projects WHERE id = p_project_id;

  INSERT INTO public.time_entries
    (organization_id, person_id, person_type, person_name, project_id, project_name,
     clock_in, clock_out, source_app, created_by, updated_at)
  VALUES
    (v_org, v_person, v_person_type, v_person_name, p_project_id, v_project_name,
     now(), NULL, 'GC', v_uid, now())
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

COMMIT;

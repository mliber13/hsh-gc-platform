-- Crew time clock — Phase 4: crew self-service clock in/out (attendance) via SECURITY DEFINER.
--
-- time_entries is readable by active org members (RLS), so crew read their own punch directly.
-- Writes require user_can_edit (operators only), so crew clock in/out go through these RPCs.
-- Feeds the existing time_entries -> payroll import.
--
-- Org note: post-typeconvert, time_entries.organization_id IS the uuid org column (there is no
-- organization_id_uuid), same as schedule_items — so we compare/insert it against v_org
-- (get_user_organization_uuid()). See docs/CREW_TIME_CLOCK_PLAN.md.

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
    COALESCE(p.linked_employee_id, p.linked_contractor_id),
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

  -- Must be assigned to a schedule item on this project.
  IF NOT EXISTS (
    SELECT 1 FROM public.schedule_items si
    WHERE si.project_id = p_project_id
      AND si.organization_id = v_org
      AND v_person = ANY(si.assigned_persons)
  ) THEN
    RAISE EXCEPTION 'not assigned to this job';
  END IF;

  -- One open punch per person.
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

CREATE OR REPLACE FUNCTION public.crew_clock_out(p_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_person text;
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

  SELECT COALESCE(p.linked_employee_id, p.linked_contractor_id)
    INTO v_person
    FROM public.profiles p
    WHERE p.id = v_uid;
  IF v_person IS NULL OR v_person = '' THEN
    RAISE EXCEPTION 'crew account not linked to a team member';
  END IF;

  UPDATE public.time_entries
    SET clock_out = now(), updated_at = now()
    WHERE id = p_entry_id
      AND organization_id = v_org
      AND person_id = v_person
      AND clock_out IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no open punch to clock out';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crew_clock_in(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crew_clock_out(uuid) TO authenticated;

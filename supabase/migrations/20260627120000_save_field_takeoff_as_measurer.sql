-- D.6.8 Phase 3b — crew measurer field takeoff writes via SECURITY DEFINER RPC.
-- Crew cannot UPDATE projects directly; this merges p_takeoff into metadata.legacy.fieldTakeoff.

BEGIN;

CREATE OR REPLACE FUNCTION public.crew_is_measurer(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_crew_role(uid)
    AND LOWER(COALESCE(public.get_my_linked_position_name(), '')) LIKE '%measure%';
$$;

CREATE OR REPLACE FUNCTION public.crew_has_measure_assignment(
  p_project_id uuid,
  uid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.schedule_items si
    JOIN public.profiles p ON p.id = uid
    WHERE si.project_id = p_project_id
      AND si.organization_id = p.organization_id
      AND public.user_has_crew_role(uid)
      AND COALESCE(p.linked_employee_id, p.linked_contractor_id, '') <> ''
      AND COALESCE(p.linked_employee_id, p.linked_contractor_id) = ANY(si.assigned_persons)
      AND si.type = 'field'
      AND LOWER(COALESCE(si.name, '')) LIKE '%measure%'
  );
$$;

CREATE OR REPLACE FUNCTION public.save_field_takeoff_as_measurer(
  p_project_id uuid,
  p_takeoff jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_meta jsonb;
  v_legacy jsonb;
  v_prev_takeoff jsonb;
  v_merged jsonb;
  v_now text;
  v_review_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_takeoff IS NULL OR jsonb_typeof(p_takeoff) <> 'object' THEN
    RAISE EXCEPTION 'p_takeoff must be a JSON object';
  END IF;

  v_org := public.get_user_organization_uuid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organization';
  END IF;

  IF NOT public.crew_is_measurer(v_uid)
     OR NOT public.crew_has_measure_assignment(p_project_id, v_uid) THEN
    RAISE EXCEPTION 'not authorized to save field takeoff on this project';
  END IF;

  SELECT p.metadata
  INTO v_meta
  FROM public.projects p
  WHERE p.id = p_project_id
    AND p.organization_id = v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found';
  END IF;

  IF v_meta IS NULL OR jsonb_typeof(v_meta) <> 'object' THEN
    v_meta := '{}'::jsonb;
  END IF;

  v_legacy := COALESCE(v_meta->'legacy', '{}'::jsonb);
  IF jsonb_typeof(v_legacy) <> 'object' THEN
    v_legacy := '{}'::jsonb;
  END IF;

  v_prev_takeoff := COALESCE(v_legacy->'fieldTakeoff', '{}'::jsonb);
  IF jsonb_typeof(v_prev_takeoff) <> 'object' THEN
    v_prev_takeoff := '{}'::jsonb;
  END IF;

  v_review_status := COALESCE(v_prev_takeoff->>'reviewStatus', '');
  IF v_review_status IN ('pending_review', 'approved') THEN
    RAISE EXCEPTION 'field takeoff is locked for review';
  END IF;

  v_now := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  v_merged := v_prev_takeoff || p_takeoff || jsonb_build_object('updatedAt', v_now);

  v_legacy := v_legacy || jsonb_build_object('fieldTakeoff', v_merged);
  v_meta := v_meta || jsonb_build_object('legacy', v_legacy);

  UPDATE public.projects
  SET metadata = v_meta,
      updated_at = now()
  WHERE id = p_project_id
    AND organization_id = v_org;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crew_is_measurer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crew_has_measure_assignment(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_field_takeoff_as_measurer(uuid, jsonb) TO authenticated;

COMMIT;

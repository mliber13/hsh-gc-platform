-- Allow any assigned crew member to append a job-site photo without rewriting
-- the field takeoff / touching reviewStatus (isolated from save_field_takeoff_as_measurer).

BEGIN;

CREATE OR REPLACE FUNCTION public.crew_is_assigned_to_project(
  p_project_id uuid,
  uid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Same assignment predicate as crew_can_post_comms / fetchCrewProjectList:
  -- a schedule_items row on the project whose assigned_persons contains the
  -- caller's linked person id.
  SELECT
    public.user_has_crew_role(uid)
    AND EXISTS (
      SELECT 1
      FROM public.schedule_items si
      JOIN public.profiles p ON p.id = uid
      WHERE si.project_id = p_project_id
        AND si.organization_id = p.organization_id
        AND COALESCE(p.linked_employee_id, p.linked_contractor_id, '') <> ''
        AND COALESCE(p.linked_employee_id, p.linked_contractor_id) = ANY(si.assigned_persons)
    );
$$;

CREATE OR REPLACE FUNCTION public.crew_append_field_photo(
  p_project_id uuid,
  p_photo jsonb
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
  v_takeoff jsonb;
  v_photos jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_photo IS NULL OR jsonb_typeof(p_photo) <> 'object' THEN
    RAISE EXCEPTION 'p_photo must be a JSON object';
  END IF;

  v_org := public.get_user_organization_uuid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organization';
  END IF;

  IF NOT public.crew_is_assigned_to_project(p_project_id, v_uid) THEN
    RAISE EXCEPTION 'not authorized to upload photos on this project';
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

  v_takeoff := COALESCE(v_legacy->'fieldTakeoff', '{}'::jsonb);
  IF jsonb_typeof(v_takeoff) <> 'object' THEN
    v_takeoff := '{}'::jsonb;
  END IF;

  v_photos := COALESCE(v_takeoff->'photos', '[]'::jsonb);
  IF jsonb_typeof(v_photos) <> 'array' THEN
    v_photos := '[]'::jsonb;
  END IF;

  v_photos := v_photos || jsonb_build_array(p_photo);
  v_takeoff := v_takeoff || jsonb_build_object('photos', v_photos);
  v_legacy := v_legacy || jsonb_build_object('fieldTakeoff', v_takeoff);
  v_meta := v_meta || jsonb_build_object('legacy', v_legacy);

  UPDATE public.projects
  SET metadata = v_meta,
      updated_at = now()
  WHERE id = p_project_id
    AND organization_id = v_org;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crew_is_assigned_to_project(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crew_append_field_photo(uuid, jsonb) TO authenticated;

COMMIT;

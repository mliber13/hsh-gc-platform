-- D.6.6a fix — crew users need to look up their own position name without reading the full HR roster.
-- SECURITY DEFINER function: takes the calling user, finds their crew_profile_links linkage,
-- walks the org_team JSONB payload to find their team member, returns just the position name.
-- Returns NULL when there's no linkage or no position assigned.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_linked_position_name()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_linked_employee_id text;
  v_linked_contractor_id text;
  v_payload jsonb;
  v_position_id text;
  v_position_name text;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT linked_employee_id, linked_contractor_id
    INTO v_linked_employee_id, v_linked_contractor_id
    FROM public.profiles
    WHERE id = v_uid
    LIMIT 1;

  IF v_linked_employee_id IS NULL AND v_linked_contractor_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_org_id := public.get_user_organization_uuid();
  IF v_org_id IS NULL THEN RETURN NULL; END IF;

  SELECT payload INTO v_payload
    FROM public.org_team
    WHERE organization_id = v_org_id
    LIMIT 1;

  IF v_payload IS NULL THEN RETURN NULL; END IF;

  -- Find the member's positionId in employees[] or contractors1099[].
  IF v_linked_employee_id IS NOT NULL THEN
    SELECT member->>'positionId'
      INTO v_position_id
      FROM jsonb_array_elements(COALESCE(v_payload->'employees', '[]'::jsonb)) AS member
      WHERE member->>'id' = v_linked_employee_id
      LIMIT 1;
  END IF;

  IF v_position_id IS NULL AND v_linked_contractor_id IS NOT NULL THEN
    SELECT member->>'positionId'
      INTO v_position_id
      FROM jsonb_array_elements(COALESCE(v_payload->'contractors1099', '[]'::jsonb)) AS member
      WHERE member->>'id' = v_linked_contractor_id
      LIMIT 1;
  END IF;

  IF v_position_id IS NULL THEN RETURN NULL; END IF;

  -- Resolve positionId → positions[].name.
  SELECT pos->>'name'
    INTO v_position_name
    FROM jsonb_array_elements(COALESCE(v_payload->'positions', '[]'::jsonb)) AS pos
    WHERE pos->>'id' = v_position_id
    LIMIT 1;

  RETURN v_position_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_linked_position_name() TO authenticated;

COMMIT;

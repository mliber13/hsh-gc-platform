-- Field foreman: delete a schedule item. Same guard as the other foreman RPCs
-- (crew role + is_field_foreman + item in caller's org). Strips ghost predecessor
-- refs to the deleted item from siblings (mirrors the operator delete cleanup) so
-- cascade doesn't break. Removing a predecessor only relaxes constraints, so no
-- re-cascade is needed.

BEGIN;

CREATE OR REPLACE FUNCTION public.foreman_delete_schedule_item(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_project uuid;
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

  SELECT si.project_id
    INTO v_project
    FROM public.schedule_items si
    WHERE si.id = p_item_id
      AND si.organization_id = v_org;
  IF v_project IS NULL THEN
    RAISE EXCEPTION 'schedule item not found';
  END IF;

  DELETE FROM public.schedule_items
  WHERE id = p_item_id
    AND organization_id = v_org;

  -- Remove any predecessor entry that references the deleted item from siblings.
  UPDATE public.schedule_items si
  SET predecessors = COALESCE((
        SELECT jsonb_agg(elem)
        FROM jsonb_array_elements(si.predecessors) elem
        WHERE elem->>'predecessor_id' IS DISTINCT FROM p_item_id::text
      ), '[]'::jsonb),
      updated_at = now()
  WHERE si.project_id = v_project
    AND si.organization_id = v_org
    AND si.predecessors @> jsonb_build_array(
      jsonb_build_object('predecessor_id', p_item_id::text)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.foreman_delete_schedule_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.foreman_delete_schedule_item(uuid) TO authenticated;

COMMIT;

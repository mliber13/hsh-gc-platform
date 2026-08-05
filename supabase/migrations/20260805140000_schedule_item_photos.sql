-- Per-schedule-item progress photos. Photos live in schedule_items.photos (jsonb
-- array of { id, storagePath, uploadedAt, uploadedBy }); the file bytes go in the
-- existing drywall-field-photos bucket. Any crew assigned to the item (or a field
-- foreman / operator) can add or remove them via these SECURITY DEFINER RPCs.

BEGIN;

ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb;

-- True when the caller may add/remove photos on this schedule item:
-- an operator, a field foreman, or crew assigned to the item.
CREATE OR REPLACE FUNCTION public.crew_can_photo_schedule_item(
  p_item_id uuid,
  uid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.user_can_edit()
    OR (public.user_has_crew_role(uid) AND public.user_is_field_foreman(uid))
    OR EXISTS (
      SELECT 1
      FROM public.schedule_items si
      JOIN public.profiles p ON p.id = uid
      WHERE si.id = p_item_id
        AND si.organization_id = p.organization_id
        AND COALESCE(p.linked_employee_id, p.linked_contractor_id, '') <> ''
        AND COALESCE(p.linked_employee_id, p.linked_contractor_id) = ANY(si.assigned_persons)
    );
$$;

CREATE OR REPLACE FUNCTION public.crew_append_schedule_item_photo(
  p_item_id uuid,
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
  IF NOT public.crew_can_photo_schedule_item(p_item_id, v_uid) THEN
    RAISE EXCEPTION 'not authorized to add photos to this item';
  END IF;

  UPDATE public.schedule_items
  SET photos = COALESCE(photos, '[]'::jsonb) || jsonb_build_array(
        p_photo
          || jsonb_build_object('uploadedBy', v_uid::text)
          || jsonb_build_object(
               'uploadedAt',
               COALESCE(NULLIF(p_photo->>'uploadedAt', ''), now()::text)
             )
      ),
      updated_at = now()
  WHERE id = p_item_id
    AND organization_id = v_org;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'schedule item not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.crew_remove_schedule_item_photo(
  p_item_id uuid,
  p_storage_path text
)
RETURNS void
LANGUAGE plpgsql
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
  IF NOT public.crew_can_photo_schedule_item(p_item_id, v_uid) THEN
    RAISE EXCEPTION 'not authorized to remove photos on this item';
  END IF;

  UPDATE public.schedule_items si
  SET photos = COALESCE((
        SELECT jsonb_agg(elem)
        FROM jsonb_array_elements(si.photos) elem
        WHERE elem->>'storagePath' IS DISTINCT FROM p_storage_path
      ), '[]'::jsonb),
      updated_at = now()
  WHERE si.id = p_item_id
    AND si.organization_id = v_org;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'schedule item not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.crew_can_photo_schedule_item(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crew_append_schedule_item_photo(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crew_remove_schedule_item_photo(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crew_can_photo_schedule_item(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crew_append_schedule_item_photo(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crew_remove_schedule_item_photo(uuid, text) TO authenticated;

COMMIT;

-- Fix comms authors showing as email: resolve the display name at read time from
-- the message's authorUserId (profile full name, else the linked org_team member
-- name), falling back to the stored author. Crew profiles often lack full_name, so
-- posts saved their email — this repairs the display without a data backfill.

-- Best display name for a user id: profile full name, else their linked org_team
-- member name, else NULL (caller falls back to the stored author).
CREATE OR REPLACE FUNCTION public.display_name_for_user(uid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(trim(p.full_name), ''),
    (
      SELECT NULLIF(trim(elem->>'name'), '')
      FROM public.org_team ot,
           jsonb_array_elements(COALESCE(ot.payload->'employees', '[]'::jsonb)) elem
      WHERE ot.organization_id = p.organization_id
        AND COALESCE(p.linked_employee_id, '') <> ''
        AND elem->>'id' = p.linked_employee_id
      LIMIT 1
    ),
    (
      SELECT NULLIF(trim(elem->>'name'), '')
      FROM public.org_team ot,
           jsonb_array_elements(COALESCE(ot.payload->'contractors1099', '[]'::jsonb)) elem
      WHERE ot.organization_id = p.organization_id
        AND COALESCE(p.linked_contractor_id, '') <> ''
        AND elem->>'id' = p.linked_contractor_id
      LIMIT 1
    )
  )
  FROM public.profiles p
  WHERE p.id = uid;
$$;

REVOKE ALL ON FUNCTION public.display_name_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.display_name_for_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.recent_comms_for_user(p_limit int DEFAULT 100)
RETURNS TABLE(
  project_id uuid,
  project_name text,
  entry_id text,
  at timestamptz,
  author text,
  author_role text,
  body text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_is_operator boolean;
  v_person text;
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  v_org := public.get_user_organization_uuid();
  IF v_org IS NULL THEN RETURN; END IF;

  v_is_operator := public.user_can_edit();
  SELECT COALESCE(pr.linked_employee_id, pr.linked_contractor_id, '')
    INTO v_person
    FROM public.profiles pr
    WHERE pr.id = v_uid;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    e.elem->>'id',
    (e.elem->>'at')::timestamptz,
    COALESCE(
      CASE
        WHEN NULLIF(e.elem->>'authorUserId', '') IS NOT NULL
          THEN public.display_name_for_user((e.elem->>'authorUserId')::uuid)
        ELSE NULL
      END,
      NULLIF(trim(e.elem->>'author'), ''),
      'Unknown'
    ),
    COALESCE(NULLIF(e.elem->>'authorRole', ''), 'operator'),
    e.elem->>'body'
  FROM public.projects p
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(p.metadata->'legacy'->'commsLog', '[]'::jsonb)
  ) AS e(elem)
  WHERE p.organization_id = v_org
    AND (e.elem->>'at') IS NOT NULL
    AND (e.elem->>'body') IS NOT NULL
    AND (
      v_is_operator
      OR (
        v_person <> ''
        AND EXISTS (
          SELECT 1 FROM public.schedule_items si
          WHERE si.project_id = p.id
            AND si.organization_id = v_org
            AND v_person = ANY(si.assigned_persons)
        )
      )
    )
  ORDER BY (e.elem->>'at')::timestamptz DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.recent_comms_for_user(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recent_comms_for_user(int) TO authenticated;

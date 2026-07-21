-- Comms unread — compute counts server-side to stop shipping full project metadata (egress fix).
--
-- The unread badge previously fetched every project's full `metadata` (~11 MB across all
-- projects) every poll just to read each project's commsLog. This RPC computes the unread
-- count + last-entry timestamp per project entirely in SQL and returns only those scalars.
-- Unread = commsLog[] entries with `at` > the caller's comms_read_state.last_read_at.

CREATE OR REPLACE FUNCTION public.comms_unread_for_projects(p_project_ids uuid[])
RETURNS TABLE(project_id uuid, unread_count integer, last_entry_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  v_org := public.get_user_organization_uuid();
  IF v_org IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    p.id,
    COUNT(*) FILTER (
      WHERE (e.elem->>'at') IS NOT NULL
        AND (e.elem->>'at')::timestamptz > COALESCE(crs.last_read_at, to_timestamp(0))
    )::int,
    MAX((e.elem->>'at')::timestamptz)
  FROM public.projects p
  LEFT JOIN public.comms_read_state crs
    ON crs.project_id = p.id
   AND crs.user_id = v_uid
   AND crs.organization_id = v_org
  LEFT JOIN LATERAL jsonb_array_elements(
    COALESCE(p.metadata->'legacy'->'commsLog', '[]'::jsonb)
  ) AS e(elem) ON true
  WHERE p.id = ANY(p_project_ids)
    AND p.organization_id = v_org
  GROUP BY p.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.comms_unread_for_projects(uuid[]) TO authenticated;

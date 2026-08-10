-- Bell unread should include customer/GC-super messages sent through the customer
-- share link (and customer SMS) — these live in customer_messages, a separate table
-- from the internal commsLog and from sub communication_log_entries. Count unread
-- inbound rows from all three sources against the same comms_read_state watermark.
-- Self-contained (supersedes 20260807120000).

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
    (
      -- internal project comms (crew / office / sub in-app)
      COALESCE((
        SELECT COUNT(*)
        FROM jsonb_array_elements(
          COALESCE(p.metadata->'legacy'->'commsLog', '[]'::jsonb)
        ) e
        WHERE (e->>'at') IS NOT NULL
          AND (e->>'at')::timestamptz > COALESCE(crs.last_read_at, to_timestamp(0))
      ), 0)
      +
      -- sub SMS / schedule confirmations
      COALESCE((
        SELECT COUNT(*)
        FROM public.communication_log_entries cle
        WHERE cle.project_id = p.id
          AND cle.organization_id = v_org
          AND cle.direction = 'inbound'
          AND cle.created_at > COALESCE(crs.last_read_at, to_timestamp(0))
      ), 0)
      +
      -- customer / GC-super messages (share link + customer SMS)
      COALESCE((
        SELECT COUNT(*)
        FROM public.customer_messages cm
        WHERE cm.project_id = p.id
          AND cm.organization_id = v_org
          AND cm.direction = 'inbound'
          AND cm.created_at > COALESCE(crs.last_read_at, to_timestamp(0))
      ), 0)
    )::int AS unread_count,
    GREATEST(
      (
        SELECT MAX((e->>'at')::timestamptz)
        FROM jsonb_array_elements(
          COALESCE(p.metadata->'legacy'->'commsLog', '[]'::jsonb)
        ) e
        WHERE (e->>'at') IS NOT NULL
      ),
      (
        SELECT MAX(cle.created_at)
        FROM public.communication_log_entries cle
        WHERE cle.project_id = p.id AND cle.organization_id = v_org AND cle.direction = 'inbound'
      ),
      (
        SELECT MAX(cm.created_at)
        FROM public.customer_messages cm
        WHERE cm.project_id = p.id AND cm.organization_id = v_org AND cm.direction = 'inbound'
      )
    ) AS last_entry_at
  FROM public.projects p
  LEFT JOIN public.comms_read_state crs
    ON crs.project_id = p.id
   AND crs.user_id = v_uid
   AND crs.organization_id = v_org
  WHERE p.id = ANY(p_project_ids)
    AND p.organization_id = v_org;
END;
$$;

GRANT EXECUTE ON FUNCTION public.comms_unread_for_projects(uuid[]) TO authenticated;

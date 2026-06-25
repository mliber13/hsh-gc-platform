BEGIN;

CREATE TABLE IF NOT EXISTS public.comms_read_state (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_comms_read_state_org
  ON public.comms_read_state(organization_id, user_id);

ALTER TABLE public.comms_read_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own read state" ON public.comms_read_state;
CREATE POLICY "Users manage own read state" ON public.comms_read_state
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND organization_id = public.get_user_organization_uuid());

COMMENT ON TABLE public.comms_read_state IS
  'D.6.3: Per-user, per-project last-read timestamp for the project comms log. Unread count = commsLog[] entries with at > last_read_at.';

-- Crew can append comms only on assigned projects (operators use standard project UPDATE RLS).
CREATE OR REPLACE FUNCTION public.crew_person_id_for_user(uid uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(p.linked_employee_id, p.linked_contractor_id)
  FROM public.profiles p
  WHERE p.id = uid
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_has_crew_role(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE('crew' = ANY(p.roles), false)
  FROM public.profiles p
  WHERE p.id = uid
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.crew_can_post_comms(
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
  );
$$;

CREATE OR REPLACE FUNCTION public.append_drywall_comms_log_entry(
  p_project_id uuid,
  p_body text,
  p_author text,
  p_author_user_id uuid,
  p_author_role text DEFAULT 'operator'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_meta jsonb;
  v_legacy jsonb;
  v_comms jsonb;
  v_entry jsonb;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF trim(COALESCE(p_body, '')) = '' THEN
    RAISE EXCEPTION 'entry body is required';
  END IF;

  v_org := public.get_user_organization_uuid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organization';
  END IF;

  IF NOT public.user_can_edit() AND NOT public.crew_can_post_comms(p_project_id, v_uid) THEN
    RAISE EXCEPTION 'not authorized to post comms on this project';
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

  v_comms := COALESCE(v_legacy->'commsLog', '[]'::jsonb);
  IF jsonb_typeof(v_comms) <> 'array' THEN
    v_comms := '[]'::jsonb;
  END IF;

  v_entry := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'at', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'author', trim(COALESCE(p_author, 'Unknown')),
    'body', trim(p_body),
    'authorRole', COALESCE(NULLIF(trim(p_author_role), ''), 'operator')
  );

  IF p_author_user_id IS NOT NULL THEN
    v_entry := v_entry || jsonb_build_object('authorUserId', p_author_user_id::text);
  END IF;

  v_legacy := v_legacy
    || jsonb_build_object(
      'commsLog', jsonb_build_array(v_entry) || v_comms,
      'updatedAt', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );

  v_meta := v_meta || jsonb_build_object('legacy', v_legacy);

  UPDATE public.projects
  SET metadata = v_meta,
      updated_at = now()
  WHERE id = p_project_id
    AND organization_id = v_org;

  RETURN v_entry;
END;
$$;

GRANT EXECUTE ON FUNCTION public.append_drywall_comms_log_entry(uuid, text, text, uuid, text) TO authenticated;

COMMIT;

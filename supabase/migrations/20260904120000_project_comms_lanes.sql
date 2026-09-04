-- Message lanes: move the drywall project comms log out of projects.metadata.legacy.commsLog
-- into its own table so per-message visibility can be enforced by RLS.
--
-- WHY A TABLE: RLS is row-level. While messages lived inside the projects.metadata
-- JSONB column, any crew member who could read their assigned project's row could read
-- every message on that job (crewWorkspaceService selects `metadata` directly). No
-- amount of client- or RPC-side filtering could gate that. One row per message is the
-- only way to make the gate real.
--
-- AUDIENCE MODEL ("office is the hub"):
--   'office'          -> office only (operators + field foreman). Internal notes.
--   'job'             -> everyone assigned to the project, plus office. Broadcasts.
--   'crew' + person   -> a private lane between the office and ONE crew person.
-- Crew never see another crew person's lane, and never see 'office'. So the cleanout
-- guy no longer sees hanger/finisher traffic.
--
-- Field foreman reads as office (owner's decision 2026-09-04), including 'office' notes.
--
-- The legacy metadata.legacy.commsLog array is left in place, untouched and unread,
-- as a rollback net. A later migration can drop it once this is proven.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_comms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- org_team member id (linked_employee_id / linked_contractor_id) at post time.
  author_person_id text,
  author_name text NOT NULL DEFAULT 'Unknown',
  author_role text NOT NULL DEFAULT 'operator'
    CHECK (author_role IN ('operator', 'crew', 'sub')),
  audience text NOT NULL DEFAULT 'office'
    CHECK (audience IN ('office', 'job', 'crew')),
  -- Required when audience = 'crew': whose private lane this message belongs to.
  audience_person_id text,
  body text NOT NULL,
  -- Provenance for the one-time backfill; also makes the backfill idempotent.
  legacy_entry_id text,
  CONSTRAINT project_comms_crew_lane_needs_person
    CHECK (audience <> 'crew' OR COALESCE(audience_person_id, '') <> '')
);

CREATE INDEX IF NOT EXISTS idx_project_comms_project_at
  ON public.project_comms(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_comms_org_at
  ON public.project_comms(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_comms_lane
  ON public.project_comms(project_id, audience, audience_person_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_comms_legacy_entry
  ON public.project_comms(project_id, legacy_entry_id)
  WHERE legacy_entry_id IS NOT NULL;

COMMENT ON TABLE public.project_comms IS
  'Per-project messages with lane-based visibility. Replaces metadata.legacy.commsLog. '
  'audience: office (office only) | job (all assigned crew + office) | crew (one person + office).';

-- ---------------------------------------------------------------------------
-- 2. RLS — reads are gated by lane; all writes go through post_project_comms()
-- ---------------------------------------------------------------------------

ALTER TABLE public.project_comms ENABLE ROW LEVEL SECURITY;

-- Office = operators (legacy editor flag OR an office RBAC role) plus the field
-- foreman, who reads as office by the owner's decision (2026-09-04).
CREATE OR REPLACE FUNCTION public.comms_user_is_office(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.user_can_edit()
    OR public.user_has_rbac_role(ARRAY['owner', 'office_gc', 'office_drywall'], uid)
    OR public.user_is_field_foreman(uid);
$$;

REVOKE ALL ON FUNCTION public.comms_user_is_office(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.comms_user_is_office(uuid) TO authenticated;

DROP POLICY IF EXISTS "Read project comms by lane" ON public.project_comms;
CREATE POLICY "Read project comms by lane" ON public.project_comms
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_uuid()
    AND (
      -- Office sees every lane.
      public.comms_user_is_office()
      -- Assigned crew see job-wide broadcasts.
      OR (
        audience = 'job'
        AND public.crew_is_assigned_to_project(project_id)
      )
      -- Crew see their own private lane, and only their own.
      OR (
        audience = 'crew'
        AND COALESCE(public.crew_person_id_for_user(), '') <> ''
        AND audience_person_id = public.crew_person_id_for_user()
      )
    )
  );

-- No INSERT/UPDATE/DELETE policies: the SECURITY DEFINER RPC is the only writer,
-- so author identity and lane assignment cannot be forged by the client.
REVOKE INSERT, UPDATE, DELETE ON public.project_comms FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3. Post RPC — derives author identity server-side (closes author spoofing)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.post_project_comms(
  p_project_id uuid,
  p_body text,
  p_audience text DEFAULT NULL,
  p_audience_person_id text DEFAULT NULL
)
RETURNS public.project_comms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_is_office boolean;
  v_person text;
  v_is_contractor boolean;
  v_audience text;
  v_aud_person text;
  v_role text;
  v_name text;
  v_body text := trim(COALESCE(p_body, ''));
  v_row public.project_comms;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF v_body = '' THEN
    RAISE EXCEPTION 'message body is required';
  END IF;

  v_org := public.get_user_organization_uuid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organization';
  END IF;

  PERFORM 1 FROM public.projects
   WHERE id = p_project_id AND organization_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found';
  END IF;

  v_is_office := public.comms_user_is_office(v_uid);
  v_person := COALESCE(public.crew_person_id_for_user(v_uid), '');

  SELECT COALESCE(NULLIF(p.linked_contractor_id, ''), '') <> ''
    INTO v_is_contractor
    FROM public.profiles p
   WHERE p.id = v_uid;

  IF v_is_office THEN
    -- Office chooses the lane; default to an internal note.
    v_audience := COALESCE(NULLIF(trim(COALESCE(p_audience, '')), ''), 'office');
    IF v_audience NOT IN ('office', 'job', 'crew') THEN
      RAISE EXCEPTION 'invalid audience: %', v_audience;
    END IF;
    IF v_audience = 'crew' THEN
      v_aud_person := NULLIF(trim(COALESCE(p_audience_person_id, '')), '');
      IF v_aud_person IS NULL THEN
        RAISE EXCEPTION 'a crew lane requires audience_person_id';
      END IF;
    ELSE
      v_aud_person := NULL;
    END IF;
    v_role := 'operator';
  ELSE
    -- Crew: always their own private lane with the office. Never a choice.
    IF NOT public.crew_is_assigned_to_project(p_project_id, v_uid) THEN
      RAISE EXCEPTION 'not authorized to post on this project';
    END IF;
    IF v_person = '' THEN
      RAISE EXCEPTION 'your account is not linked to a team member';
    END IF;
    v_audience := 'crew';
    v_aud_person := v_person;
    v_role := CASE WHEN v_is_contractor THEN 'sub' ELSE 'crew' END;
  END IF;

  -- Author name is resolved server-side; the client cannot supply it.
  v_name := COALESCE(NULLIF(trim(public.display_name_for_user(v_uid)), ''), 'Unknown');

  INSERT INTO public.project_comms (
    organization_id, project_id, author_user_id, author_person_id,
    author_name, author_role, audience, audience_person_id, body
  ) VALUES (
    v_org, p_project_id, v_uid, NULLIF(v_person, ''),
    v_name, v_role, v_audience, v_aud_person, v_body
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.post_project_comms(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_project_comms(uuid, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Backfill from the legacy blob
--    Crew/sub-authored entries -> that person's lane (they keep their own history).
--    Everything else            -> office only (safe default; old job-wide
--                                  announcements drop out of crew view).
-- ---------------------------------------------------------------------------

INSERT INTO public.project_comms (
  organization_id, project_id, created_at, author_user_id, author_person_id,
  author_name, author_role, audience, audience_person_id, body, legacy_entry_id
)
SELECT
  p.organization_id,
  p.id,
  COALESCE((e.elem->>'at')::timestamptz, now()),
  NULLIF(e.elem->>'authorUserId', '')::uuid,
  auth_person.person_id,
  COALESCE(NULLIF(trim(e.elem->>'author'), ''), 'Unknown'),
  CASE
    WHEN COALESCE(e.elem->>'authorRole', 'operator') IN ('crew', 'sub')
      THEN e.elem->>'authorRole'
    ELSE 'operator'
  END,
  CASE
    WHEN COALESCE(e.elem->>'authorRole', 'operator') IN ('crew', 'sub')
     AND COALESCE(auth_person.person_id, '') <> ''
      THEN 'crew'
    ELSE 'office'
  END,
  CASE
    WHEN COALESCE(e.elem->>'authorRole', 'operator') IN ('crew', 'sub')
     AND COALESCE(auth_person.person_id, '') <> ''
      THEN auth_person.person_id
    ELSE NULL
  END,
  e.elem->>'body',
  e.elem->>'id'
FROM public.projects p
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(p.metadata->'legacy'->'commsLog', '[]'::jsonb)
) AS e(elem)
LEFT JOIN LATERAL (
  SELECT COALESCE(pr.linked_employee_id, pr.linked_contractor_id) AS person_id
  FROM public.profiles pr
  WHERE pr.id = NULLIF(e.elem->>'authorUserId', '')::uuid
  LIMIT 1
) AS auth_person ON true
WHERE jsonb_typeof(COALESCE(p.metadata->'legacy'->'commsLog', '[]'::jsonb)) = 'array'
  AND NULLIF(e.elem->>'id', '') IS NOT NULL
  AND NULLIF(e.elem->>'body', '') IS NOT NULL
  AND NULLIF(e.elem->>'at', '') IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Cross-project feed — reads the table, lane-filtered
-- ---------------------------------------------------------------------------

-- This version returns two more columns (audience, audience_person_id) than the
-- one in prod. Postgres refuses CREATE OR REPLACE when a function's OUT-parameter
-- row type changes (42P13), so the old one must be dropped first. Same signature
-- throughout its history — (int) — so this targets it exactly. No CASCADE: the
-- only caller is the client via PostgREST (commsFeedService.ts:33), so if a SQL
-- dependent ever appears we want this to fail loudly inside the transaction
-- rather than silently drop it.
DROP FUNCTION IF EXISTS public.recent_comms_for_user(int);

CREATE OR REPLACE FUNCTION public.recent_comms_for_user(p_limit int DEFAULT 100)
RETURNS TABLE(
  project_id uuid,
  project_name text,
  entry_id text,
  at timestamptz,
  author text,
  author_role text,
  body text,
  audience text,
  audience_person_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_is_office boolean;
  v_person text;
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  v_org := public.get_user_organization_uuid();
  IF v_org IS NULL THEN RETURN; END IF;

  v_is_office := public.comms_user_is_office(v_uid);
  v_person := COALESCE(public.crew_person_id_for_user(v_uid), '');

  RETURN QUERY
  SELECT
    c.project_id,
    p.name,
    c.id::text,
    c.created_at,
    c.author_name,
    c.author_role,
    c.body,
    c.audience,
    c.audience_person_id
  FROM public.project_comms c
  JOIN public.projects p ON p.id = c.project_id
  WHERE c.organization_id = v_org
    AND (
      v_is_office
      OR (
        v_person <> ''
        AND (
          (c.audience = 'crew' AND c.audience_person_id = v_person)
          OR (
            c.audience = 'job'
            AND public.crew_is_assigned_to_project(c.project_id, v_uid)
          )
        )
      )
    )
  ORDER BY c.created_at DESC
  LIMIT v_limit;
END;
$$;

-- The DROP above discarded the grants set by 20260806140000, and a freshly created
-- function is EXECUTE-able by PUBLIC (which includes anon) by default. Re-issue the
-- REVOKE as well as the GRANT so the drop doesn't quietly widen access.
REVOKE ALL ON FUNCTION public.recent_comms_for_user(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recent_comms_for_user(int) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Unread counts — lane-filtered, and crew no longer get badges for
--    sub-SMS / customer messages they are not allowed to read.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.comms_unread_for_projects(p_project_ids uuid[])
RETURNS TABLE(project_id uuid, unread_count integer, last_entry_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_is_office boolean;
  v_person text;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  v_org := public.get_user_organization_uuid();
  IF v_org IS NULL THEN RETURN; END IF;

  v_is_office := public.comms_user_is_office(v_uid);
  v_person := COALESCE(public.crew_person_id_for_user(v_uid), '');

  RETURN QUERY
  SELECT
    p.id,
    (
      COALESCE((
        SELECT COUNT(*)
        FROM public.project_comms c
        WHERE c.project_id = p.id
          AND c.organization_id = v_org
          AND c.created_at > COALESCE(crs.last_read_at, to_timestamp(0))
          AND c.author_user_id IS DISTINCT FROM v_uid
          AND (
            v_is_office
            OR (
              v_person <> ''
              AND (
                (c.audience = 'crew' AND c.audience_person_id = v_person)
                OR (c.audience = 'job'
                    AND public.crew_is_assigned_to_project(p.id, v_uid))
              )
            )
          )
      ), 0)
      +
      -- Sub SMS / schedule confirmations — office only.
      CASE WHEN v_is_office THEN COALESCE((
        SELECT COUNT(*)
        FROM public.communication_log_entries cle
        WHERE cle.project_id = p.id
          AND cle.organization_id = v_org
          AND cle.direction = 'inbound'
          AND cle.created_at > COALESCE(crs.last_read_at, to_timestamp(0))
      ), 0) ELSE 0 END
      +
      -- Customer / GC-super messages — office only.
      CASE WHEN v_is_office THEN COALESCE((
        SELECT COUNT(*)
        FROM public.customer_messages cm
        WHERE cm.project_id = p.id
          AND cm.organization_id = v_org
          AND cm.direction = 'inbound'
          AND cm.created_at > COALESCE(crs.last_read_at, to_timestamp(0))
      ), 0) ELSE 0 END
    )::int AS unread_count,
    GREATEST(
      (
        SELECT MAX(c.created_at)
        FROM public.project_comms c
        WHERE c.project_id = p.id
          AND c.organization_id = v_org
          AND (
            v_is_office
            OR (
              v_person <> ''
              AND (
                (c.audience = 'crew' AND c.audience_person_id = v_person)
                OR (c.audience = 'job'
                    AND public.crew_is_assigned_to_project(p.id, v_uid))
              )
            )
          )
      ),
      CASE WHEN v_is_office THEN (
        SELECT MAX(cle.created_at)
        FROM public.communication_log_entries cle
        WHERE cle.project_id = p.id AND cle.organization_id = v_org
          AND cle.direction = 'inbound'
      ) END,
      CASE WHEN v_is_office THEN (
        SELECT MAX(cm.created_at)
        FROM public.customer_messages cm
        WHERE cm.project_id = p.id AND cm.organization_id = v_org
          AND cm.direction = 'inbound'
      ) END
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

-- ---------------------------------------------------------------------------
-- 7. Retire the blob-append RPC. The legacy array stays for rollback, but
--    nothing may write to it any more (a writer would bypass lane gating).
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.append_drywall_comms_log_entry(uuid, text, text, uuid, text);

COMMIT;

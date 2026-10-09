-- crew_project_detail admits exactly who may read the project row — no more.
--
-- The projects table has been scoped to assignment since 20260911120000 (P0-SEC-2(b)): a
-- pure-crew login reads only projects it is assigned to, unless it is a field foreman or can
-- edit. But crew_project_detail is SECURITY DEFINER, so it never met that policy, and its only
-- check was "same organisation". Any signed-in crew account could fetch any job's crew view by
-- id — sqft, crew piece rates, site contact and phone — for a job it could not SELECT directly.
-- Its own comment claimed an assignment rule that did not exist.
--
-- The fix applies the projects SELECT policy's own predicate, term for term, so the function
-- can never disclose a project the caller could not already read (and it discloses less than
-- the row). Operators, viewers and foremen keep every job, which is what "view as" and the
-- foreman's All jobs rely on. An unassigned crew caller gets NULL, which the client already
-- treats as no access (CrewWorkspacePermissionError) — so no client change.
--
-- Assembly stays in crew_safe_legacy (20261008140000): no inline jsonb_set, which is STRICT and
-- erased whole jobs once.

BEGIN;

CREATE OR REPLACE FUNCTION public.crew_project_detail(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_row record;
BEGIN
  SELECT organization_id INTO v_org FROM public.profiles WHERE id = auth.uid();
  IF v_org IS NULL OR NOT public.is_user_active() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT id, name, address, client, status, organization_id, metadata
    INTO v_row
  FROM public.projects
  WHERE id = p_project_id AND organization_id = v_org;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- The projects SELECT policy's predicate (20260911120000), term for term. Keep them in step:
  -- crewProjectionAllowlist.test.ts checks this body carries every term.
  IF NOT (
    NOT public.user_has_crew_role()
    OR public.user_can_edit()
    OR public.user_is_field_foreman()
    OR public.crew_is_assigned_to_project(v_row.id)
  ) THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'address', v_row.address,
    'client', v_row.client,
    'status', v_row.status,
    'legacy', public.crew_safe_legacy(v_row.metadata -> 'legacy')
  );
END;
$$;

COMMENT ON FUNCTION public.crew_project_detail(uuid) IS
  'Crew-safe projection of a project for the /crew job detail. Admits exactly who the projects '
  'SELECT policy admits — operators, foremen, and crew assigned to the project — and returns '
  'NULL for anyone else. Money and unrelated keys removed; see crew_safe_legacy.';

REVOKE ALL ON FUNCTION public.crew_project_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crew_project_detail(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Prove it as real callers. auth.uid() reads request.jwt.claims, so the check impersonates a
-- live crew account and a live owner inside this transaction (is_local = true: the setting
-- ends with it). Skips with a NOTICE where the data has nobody suitable, e.g. a fresh database.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_crew record;
  v_owner uuid;
  v_assigned uuid;
  v_unassigned uuid;
  v_checked int := 0;
BEGIN
  -- A plain crew member — not a foreman, active, linked to a roster person — who is assigned
  -- to at least one project and not to some other project in the same organisation.
  FOR v_crew IN
    SELECT p.id, p.organization_id,
           COALESCE(NULLIF(p.linked_employee_id, ''), NULLIF(p.linked_contractor_id, '')) AS person
    FROM public.profiles p
    WHERE p.roles @> ARRAY['crew']::text[]
      AND NOT (p.roles && ARRAY['owner', 'office_gc', 'office_drywall', 'viewer', 'admin']::text[])
      AND COALESCE(p.is_active, true)
      AND NOT COALESCE(p.is_field_foreman, false)
      AND COALESCE(NULLIF(p.linked_employee_id, ''), NULLIF(p.linked_contractor_id, '')) IS NOT NULL
  LOOP
    SELECT si.project_id INTO v_assigned
    FROM public.schedule_items si
    WHERE si.organization_id = v_crew.organization_id AND v_crew.person = ANY(si.assigned_persons)
    LIMIT 1;

    SELECT pr.id INTO v_unassigned
    FROM public.projects pr
    WHERE pr.organization_id = v_crew.organization_id
      AND NOT EXISTS (
        SELECT 1 FROM public.schedule_items si
        WHERE si.project_id = pr.id AND v_crew.person = ANY(si.assigned_persons)
      )
    LIMIT 1;

    CONTINUE WHEN v_assigned IS NULL OR v_unassigned IS NULL;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', v_crew.id, 'role', 'authenticated')::text,
      true
    );
    -- Only a genuinely plain crew caller proves anything; skip one the policy would wave through.
    CONTINUE WHEN public.user_can_edit() OR NOT public.user_has_crew_role();

    IF public.crew_project_detail(v_unassigned) IS NOT NULL THEN
      RAISE EXCEPTION 'crew_project_detail still discloses project % to unassigned crew %',
        v_unassigned, v_crew.id;
    END IF;
    IF public.crew_project_detail(v_assigned) IS NULL THEN
      RAISE EXCEPTION 'crew_project_detail now refuses project % to crew % who is assigned to it',
        v_assigned, v_crew.id;
    END IF;

    -- An owner in the same organisation still sees the job crew may not.
    SELECT p.id INTO v_owner
    FROM public.profiles p
    WHERE p.organization_id = v_crew.organization_id
      AND p.roles @> ARRAY['owner']::text[]
      AND COALESCE(p.is_active, true)
    LIMIT 1;
    IF v_owner IS NOT NULL THEN
      PERFORM set_config(
        'request.jwt.claims',
        json_build_object('sub', v_owner, 'role', 'authenticated')::text,
        true
      );
      IF public.crew_project_detail(v_unassigned) IS NULL THEN
        RAISE EXCEPTION 'crew_project_detail now refuses project % to owner %', v_unassigned, v_owner;
      END IF;
    END IF;

    v_checked := v_checked + 1;
    EXIT WHEN v_checked >= 3;
  END LOOP;

  PERFORM set_config('request.jwt.claims', '', true);

  IF v_checked = 0 THEN
    RAISE NOTICE 'crew_project_detail: no plain crew account with an assigned and an unassigned project — behaviour not exercised';
  ELSE
    RAISE NOTICE 'crew_project_detail: verified as % real crew account(s) — assigned job returned, unassigned job refused, owner still sees it', v_checked;
  END IF;
END;
$$;

COMMIT;

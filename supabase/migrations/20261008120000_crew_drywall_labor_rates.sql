-- Crew stop reading the whole drywall price book to compute their own pay estimate.
--
-- A crew phone opening a job called fetchOrgDrywallCatalogs() — the same read the operator
-- Catalogs page uses — and received the entire org_drywall_catalogs row: an 8.9 KB price book
-- with material_rate on 37 items and labor_rate on 21, plus margin_floor_target (0.30),
-- po_estimated_cost_per_sqft (1.72), dashboard_targets (annual revenue goal, backlog goal,
-- manpower targets) and standard_schedule_template. This was not a leak through a bug: the
-- SELECT predicate user_can_read_drywall_catalogs() listed 'crew' next to owner and office
-- (added 20260625120000), so the wide read was granted.
--
-- Crew's only catalog consumer is resolveQuoteCatalogLaborRates in crewWorkspaceService, and
-- it needs exactly two fields: boards[].hanger_rate and finish_scopes[].finisher_rate, each
-- matched by id. Those are the crew's own piece rates — the numbers their pay estimate is
-- computed from — so they stay. Everything else goes.
--
-- Allowlist, never denylist: a catalog field added later must default to hidden. Same shape
-- as crew_project_detail (20261007120000) — a pure projection function the DO block below can
-- assert against, plus a guarded entry point.

BEGIN;

-- ---------------------------------------------------------------------------
-- The projection. Pure, so it is testable without a user session.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crew_safe_labor_rates(p_payload jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'boards', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', b->>'id', 'hanger_rate', b->'hanger_rate'))
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p_payload->'boards') = 'array'
             THEN p_payload->'boards' ELSE '[]'::jsonb END
      ) AS b
      WHERE b ? 'id'
    ), '[]'::jsonb),
    'finish_scopes', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', f->>'id', 'finisher_rate', f->'finisher_rate'))
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p_payload->'finish_scopes') = 'array'
             THEN p_payload->'finish_scopes' ELSE '[]'::jsonb END
      ) AS f
      WHERE f ? 'id'
    ), '[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.crew_safe_labor_rates(jsonb) IS
  'Allowlist projection of a drywall catalog payload: board id + hanger_rate and finish scope id + finisher_rate only. Anything else a catalog carries is withheld by construction.';

-- ---------------------------------------------------------------------------
-- The entry point crew call. SECURITY DEFINER, because the SELECT predicate on
-- org_drywall_catalogs no longer admits them (see below).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crew_drywall_labor_rates()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = 'P0001';
  END IF;

  v_org := public.get_user_organization_uuid();
  IF v_org IS NULL OR NOT public.is_user_active() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = 'P0001';
  END IF;

  SELECT public.crew_safe_labor_rates(c.payload)
  INTO v_result
  FROM public.org_drywall_catalogs c
  WHERE c.organization_id = v_org;

  -- An org with no catalog row yet is not an error; the caller falls back to its own
  -- defaults, exactly as it did when the payload was empty.
  RETURN coalesce(
    v_result,
    jsonb_build_object('boards', '[]'::jsonb, 'finish_scopes', '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.crew_drywall_labor_rates() IS
  'The two catalog rates a crew pay estimate needs, for the caller own org. Replaces a crew SELECT over all of org_drywall_catalogs.';

-- A function is reachable by a named grant AND via PUBLIC; revoke both before granting.
REVOKE ALL ON FUNCTION public.crew_safe_labor_rates(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crew_drywall_labor_rates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crew_drywall_labor_rates() TO authenticated;

-- ---------------------------------------------------------------------------
-- Close the grant that made the wide read legal. Reverts 20260625120000.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_can_read_drywall_catalogs(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_rbac_role(
    ARRAY['owner', 'office_gc', 'office_drywall', 'viewer']::text[],
    uid
  );
$$;

-- ---------------------------------------------------------------------------
-- Prove it, here, so a projection that silently returns everything fails the
-- deploy instead of looking fixed.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fixture jsonb;
  v_out jsonb;
  v_keys text[];
  v_live text;
  v_src text;
BEGIN
  -- 1. The projection keeps exactly the allowlisted keys, on a payload shaped like the
  --    real one (every field BoardCatalogEntry and FinishScopeCatalogEntry carry).
  v_fixture := jsonb_build_object(
    'boards', jsonb_build_array(jsonb_build_object(
      'id', 'b1', 'hanger_rate', 0.11, 'display_name', '5/8" Type X',
      'material_rate', 0.42, 'default_waste_pct', 10, 'notes', 'internal'
    )),
    'finish_scopes', jsonb_build_array(jsonb_build_object(
      'id', 'f1', 'finisher_rate', 0.33, 'display_name', 'Level 4',
      'payroll_piece_key', 'finish_l4', 'accessories_applied', '{}'::jsonb,
      'applies_to_locations', jsonb_build_array('walls'), 'notes', 'internal'
    )),
    'accessories', jsonb_build_array(jsonb_build_object('id', 'a1', 'material_rate', 9.99))
  );

  v_out := public.crew_safe_labor_rates(v_fixture);

  SELECT array_agg(k ORDER BY k) INTO v_keys
  FROM jsonb_object_keys(v_out->'boards'->0) AS k;
  IF v_keys IS DISTINCT FROM ARRAY['hanger_rate', 'id'] THEN
    RAISE EXCEPTION 'crew_safe_labor_rates leaked board keys: %', v_keys;
  END IF;

  SELECT array_agg(k ORDER BY k) INTO v_keys
  FROM jsonb_object_keys(v_out->'finish_scopes'->0) AS k;
  IF v_keys IS DISTINCT FROM ARRAY['finisher_rate', 'id'] THEN
    RAISE EXCEPTION 'crew_safe_labor_rates leaked finish scope keys: %', v_keys;
  END IF;

  -- 2. The rates crew pay depends on actually survive. Dropping these is the failure
  --    mode a Batch 1B note warned had nearly shipped once.
  IF (v_out->'boards'->0->>'hanger_rate')::numeric IS DISTINCT FROM 0.11
     OR (v_out->'finish_scopes'->0->>'finisher_rate')::numeric IS DISTINCT FROM 0.33 THEN
    RAISE EXCEPTION 'crew_safe_labor_rates dropped the rates crew pay is computed from';
  END IF;

  -- 3. Whole groups crew never needed are gone, not merely unrendered. The output must
  --    carry the two allowlisted groups and nothing else.
  SELECT array_agg(k ORDER BY k) INTO v_keys FROM jsonb_object_keys(v_out) AS k;
  IF v_keys IS DISTINCT FROM ARRAY['boards', 'finish_scopes'] THEN
    RAISE EXCEPTION 'crew_safe_labor_rates returned unexpected groups: %', v_keys;
  END IF;

  -- 4. And on the real payload: no cost, margin or revenue number anywhere in the output.
  FOR v_live IN
    SELECT public.crew_safe_labor_rates(c.payload)::text FROM public.org_drywall_catalogs c
  LOOP
    IF v_live ~* '(material_rate|labor_rate|margin|waste|display_name|notes|payroll_piece_key)' THEN
      RAISE EXCEPTION 'crew_safe_labor_rates leaked on a live catalog row: %', left(v_live, 300);
    END IF;
  END LOOP;

  -- 5. The wide read is no longer granted to crew.
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'user_can_read_drywall_catalogs'
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'user_can_read_drywall_catalogs is missing';
  END IF;
  IF v_src ~* '''crew''' THEN
    RAISE EXCEPTION 'crew is still admitted by user_can_read_drywall_catalogs';
  END IF;

  RAISE NOTICE 'crew_drywall_labor_rates: projection and grant verified';
END;
$$;

COMMIT;

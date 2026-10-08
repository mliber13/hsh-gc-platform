-- crew_project_detail returned an EMPTY job for every project whose quote has no lineItems.
--
-- Found from Twinsburg - Donatelli viewed as David Busico: name, client and address rendered
-- (plain table columns), and everything from metadata.legacy was blank — "Sqft not set yet",
-- "Pay rate is set by the office", site contact and phone "—", no materials. The data was
-- all there; the projection threw it away.
--
-- The cause is that jsonb_set is STRICT: given a NULL value it returns NULL, not the input.
-- 20261007120000 did
--
--     v_quote := jsonb_set(v_quote, '{lineItems}', crew_safe_line_items(v_quote -> 'lineItems'))
--
-- A v2 quote has no lineItems key, so the inner call got NULL and returned NULL, jsonb_set
-- returned NULL, and v_quote was gone. The next line did the same thing one level up —
-- jsonb_set(v_safe, '{quote}', NULL) — and the whole legacy blob became NULL. The client
-- read that as {}.
--
-- Scale on 2026-10-08: 92 quotes have no lineItems key (every v2 quote); 25 of those
-- projects have crew assigned, 12 still active. Every crew member on them saw an empty job
-- from 2026-10-07. The 10-07 verification only ever looked at v3-shaped quotes.
--
-- The fix moves the assembly into crew_safe_legacy(), a pure function with no jsonb_set on a
-- value that can be NULL, and crew_project_detail calls it. crew_safe_quote already narrows
-- lineItems and the snapshot itself (20261008130000), so the second pass here is gone. Being
-- pure, crew_safe_legacy can be checked against EVERY live project below — which is the
-- check that would have caught this, and could not be run against crew_project_detail
-- because that needs a signed-in caller.

BEGIN;

-- ---------------------------------------------------------------------------
-- The crew-safe legacy blob. Never NULL: an absent part is left out, not nulled.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crew_safe_legacy(p_legacy jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_safe jsonb;
  v_part jsonb;
BEGIN
  IF p_legacy IS NULL OR jsonb_typeof(p_legacy) <> 'object' THEN
    RETURN '{}'::jsonb;
  END IF;

  -- Legacy keys the crew detail path reads, via the helpers that take `legacy`. Absent and
  -- therefore not sent: every quote_v3_archive, changeOrders, below_floor_approvals,
  -- commsLog, variance, audit, order, delivery, legacyId, productionTimestamps,
  -- _fromSupabase.
  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    INTO v_safe
  FROM jsonb_each(p_legacy)
  WHERE key IN (
    'id', 'name', 'client', 'address', 'status', 'notes',
    'fieldTakeoff', 'fieldMeasurementPrep', 'orders', 'poData', 'po', 'intakeSource'
  );

  -- jsonb_set is STRICT. Every value handed to it below is checked for NULL first, because
  -- a NULL there does not skip the key — it erases the whole object.
  IF v_safe ? 'fieldTakeoff' THEN
    v_part := public.crew_safe_field_takeoff(v_safe -> 'fieldTakeoff');
    IF v_part IS NULL THEN
      v_safe := v_safe - 'fieldTakeoff';
    ELSE
      v_safe := jsonb_set(v_safe, '{fieldTakeoff}', v_part, true);
    END IF;
  END IF;

  v_part := public.crew_safe_quote(p_legacy -> 'quote');
  IF v_part IS NOT NULL THEN
    v_safe := jsonb_set(v_safe, '{quote}', v_part, true);
  END IF;

  RETURN v_safe;
END;
$$;

COMMENT ON FUNCTION public.crew_safe_legacy(jsonb) IS
  'Crew-safe projection of metadata.legacy. Never returns NULL. Pure, so it can be checked '
  'against every live project; crew_project_detail is the signed-in wrapper around it.';

REVOKE ALL ON FUNCTION public.crew_safe_legacy(jsonb) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- The signed-in wrapper. Same contract as 20261007120000; only the assembly moved.
-- ---------------------------------------------------------------------------
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
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT id, name, address, client, status, organization_id, metadata
    INTO v_row
  FROM public.projects
  WHERE id = p_project_id AND organization_id = v_org;

  IF NOT FOUND THEN
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
  'Crew-safe projection of a project for the /crew job detail. Returns the same shape as the '
  'full read with money and unrelated keys removed; see crew_safe_legacy and crew_safe_quote.';

REVOKE ALL ON FUNCTION public.crew_project_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crew_project_detail(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Prove it on the shape that broke, then on every live project.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_out jsonb;
  r record;
  v_checked int := 0;
BEGIN
  -- 1. A v2 project shaped like Twinsburg - Donatelli: quote with NO lineItems key.
  v_out := public.crew_safe_legacy(jsonb_build_object(
    'name', 'Twinsburg - Donatelli',
    'quote', jsonb_build_object('version', 2, 'sqft', 12859.35, 'hangerRate', 0.35),
    'fieldTakeoff', jsonb_build_object(
      'siteContact', 'Mike Wall', 'contactPhone', '330-730-8907', 'totalMeasuredSqft', 12376,
      'reviewApprovedRates', jsonb_build_object('hangerRate', 0.3, 'finisherRate', 0.4)
    ),
    'orders', jsonb_build_array(jsonb_build_object('id', 'o1'))
  ));

  IF v_out IS NULL THEN
    RAISE EXCEPTION 'crew_safe_legacy returned NULL for a v2 quote without lineItems';
  END IF;
  IF v_out->'fieldTakeoff'->>'siteContact' IS DISTINCT FROM 'Mike Wall'
     OR v_out->'fieldTakeoff'->'reviewApprovedRates' IS NULL
     OR (v_out->'quote'->>'sqft')::numeric IS DISTINCT FROM 12859.35
     OR jsonb_array_length(v_out->'orders') <> 1 THEN
    RAISE EXCEPTION 'crew_safe_legacy lost part of a v2 job: %', v_out;
  END IF;

  -- 2. Degenerate inputs never produce NULL.
  IF public.crew_safe_legacy(NULL) IS NULL
     OR public.crew_safe_legacy('{}'::jsonb) IS NULL
     OR public.crew_safe_legacy(jsonb_build_object('quote', 'null'::jsonb)) IS NULL
     OR public.crew_safe_legacy(jsonb_build_object('fieldTakeoff', 'null'::jsonb)) IS NULL THEN
    RAISE EXCEPTION 'crew_safe_legacy returned NULL on a degenerate input';
  END IF;

  -- 3. Every live project: never NULL, and nothing crew read is dropped on the way.
  FOR r IN
    SELECT p.name, p.metadata -> 'legacy' AS legacy
    FROM public.projects p
    WHERE jsonb_typeof(p.metadata -> 'legacy') = 'object'
  LOOP
    v_checked := v_checked + 1;
    v_out := public.crew_safe_legacy(r.legacy);

    IF v_out IS NULL THEN
      RAISE EXCEPTION 'crew_safe_legacy returned NULL for %', r.name;
    END IF;
    IF jsonb_typeof(r.legacy -> 'quote') = 'object' AND NOT (v_out ? 'quote') THEN
      RAISE EXCEPTION 'crew_safe_legacy dropped the quote for %', r.name;
    END IF;
    IF jsonb_typeof(r.legacy -> 'fieldTakeoff') = 'object' AND NOT (v_out ? 'fieldTakeoff') THEN
      RAISE EXCEPTION 'crew_safe_legacy dropped the field takeoff for %', r.name;
    END IF;
    IF r.legacy ? 'orders' AND NOT (v_out ? 'orders') THEN
      RAISE EXCEPTION 'crew_safe_legacy dropped the orders for %', r.name;
    END IF;
    IF (r.legacy -> 'fieldTakeoff') ? 'reviewApprovedRates'
       AND v_out -> 'fieldTakeoff' -> 'reviewApprovedRates' IS NULL THEN
      RAISE EXCEPTION 'crew_safe_legacy dropped the approved crew rates for %', r.name;
    END IF;
  END LOOP;

  RAISE NOTICE 'crew_safe_legacy: % live projects checked, none empty, nothing crew read dropped', v_checked;
END;
$$;

COMMIT;

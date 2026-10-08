-- The crew quote allowlist was missing fields the crew page reads, and passing priced ones
-- through nested arrays.
--
-- 20261007120000 projected the project blob through an allowlist so a field nobody had
-- thought about defaults to hidden. Two things were wrong with it, found a day later from
-- Twinsburg - Donatelli.
--
-- 1. Thirteen fields the crew page reads were missing, because the list was written against
--    the v3 field names while the blob carries both spellings:
--
--    * `hangerRate` / `finisherRate` — on 91 v2 quotes AND 20 v3 quotes, read by the v2 branch
--      of resolveQuoteCatalogLaborRates. Stripped, those jobs showed a crew pay estimate with
--      no rate. `prep_clean_rate`, the v3 snake_case spelling, went the same way.
--    * The D.6.6b snake_case scope family the crew Scope of Work card renders through
--      structuredScopePdf: wall_finish (71 quotes), ceiling_finish (70), wall_thickness (73),
--      ceiling_thickness (73), hang_exceptions (62), wall_exceptions (21),
--      ceiling_exceptions (8), ceiling_finish_other (2), custom_scope_of_work (9).
--      `wall_finish_other` is added for symmetry: the card reads it, no live quote has it yet.
--
-- 2. Whole ARRAYS were allowlisted and passed through untouched, so whatever their elements
--    carried came along: breakdowns[] carried itemTotal, drywallTotal and rcChannelTotal
--    (dollar totals, on 47 breakdowns); insulationEntries[] carried materialRate (4 entries on
--    3 jobs); alternates[] carried whole unfiltered line items. Crew read exactly one nested
--    field from all of that — breakdowns[].sqft, for the pay basis.
--
-- So the allowlist now goes all the way down. Each nested array has its own allowlist,
-- alternates is dropped (nothing in the crew path reads it), and legacyV2Snapshot is projected
-- by this function itself rather than by its caller. That makes crew_safe_quote complete on
-- its own, which is what lets the live check below test the shape crew actually receive. The
-- first version of this migration checked the function without the snapshot step, flagged 92
-- live quotes that crew never receive, and failed the push — while the nested arrays it never
-- looked inside were the real leak.
--
-- No money is added anywhere. The rates kept are the crew's own piece rates — the stated
-- exception — and everything else is scope text and geometry.
--
-- The durable guard is crewProjectionAllowlist.test.ts, which parses the deployed allowlist out
-- of these migrations and the field reads out of the crew path and fails on any gap.

BEGIN;

-- ---------------------------------------------------------------------------
-- Narrow every element of an array to an allowlist of keys.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crew_safe_entries(p_items jsonb, p_keys text[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN '[]'::jsonb
    ELSE coalesce((
      SELECT jsonb_agg(
        (
          SELECT coalesce(jsonb_object_agg(f.k, f.v), '{}'::jsonb)
          FROM jsonb_each(
            CASE WHEN jsonb_typeof(t.item) = 'object' THEN t.item ELSE '{}'::jsonb END
          ) AS f(k, v)
          WHERE f.k = ANY (p_keys)
        )
        ORDER BY t.ord
      )
      FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(item, ord)
    ), '[]'::jsonb)
  END;
$$;

COMMENT ON FUNCTION public.crew_safe_entries(jsonb, text[]) IS
  'Narrows every element of a JSON array to an allowlist of keys. Used by crew_safe_quote so a '
  'nested array cannot carry a priced field past the top-level allowlist.';

-- ---------------------------------------------------------------------------
-- The quote, complete: top-level allowlist, nested allowlists, recursive snapshot.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crew_safe_quote(p_quote jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF p_quote IS NULL OR jsonb_typeof(p_quote) <> 'object' THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    INTO v
  FROM jsonb_each(p_quote)
  WHERE key IN (
    -- identity + shape
    'version', 'quoteNumber', 'updatedAt', 'outcome',
    -- what the work IS
    'scopeOfWork', 'scope_of_work', 'customScopeOfWork', 'useCustomScopeOfWork',
    'use_custom_scope_of_work', 'custom_scope_of_work', 'quoteIncludes', 'notes',
    'drywallScope', 'buildType', 'build_type', 'complexity',
    -- geometry and quantities the crew work to
    'sqft', 'frpSqft', 'hangLayers', 'finishLayers', 'wallThickness', 'ceilingThickness',
    'wallFinish', 'wallFinishOther', 'ceilingFinish', 'ceilingFinishOther',
    'hangExceptions', 'wallExceptions', 'ceilingExceptions', 'wastePercentage',
    'beadSticks', 'lagsCount', 'wireLinearFt', 'mainsCount', 'tees4ftCount',
    'shiny90Count', 'frpWallCount', 'frpWallHeight', 'frpInsideCorners',
    'frpOutsideCorners', 'frpExposedEdgesLf', 'includeFRP', 'includeRcChannel',
    'includeInsulation', 'includeSuspendedGrid', 'includeAcousticCeiling',
    'includeMetalStudFraming', 'paperFloorsRequired', 'paper_floors_required',
    'suspendedGridSqft', 'suspendedGridPerimeter', 'rcChannelCeilingSqft',
    'rcChannelWallEntries', 'rcChannelWallSpacing', 'rcChannelCeilingSpacing',
    'acousticLagsCount', 'acousticMainsCount', 'acousticTees2ftCount',
    'acousticTees4ftCount', 'acousticWallAngleCount', 'acousticWireLinearFt',
    'acousticCeilingPerimeter', 'acousticCeilingTileSize', 'metalStudEntries',
    'insulationEntries',
    -- the same geometry under the D.6.6b snake_case spellings, which is what the crew
    -- Scope of Work card reads. Missing these emptied that card on up to 73 v3 jobs.
    'wall_finish', 'wall_finish_other', 'ceiling_finish', 'ceiling_finish_other',
    'wall_thickness', 'ceiling_thickness',
    'hang_exceptions', 'wall_exceptions', 'ceiling_exceptions',
    -- arrays: each is narrowed to its own allowlist below. alternates is not here at all —
    -- nothing in the crew path reads it, and it nests whole priced line items.
    'lineItems', 'breakdowns',
    -- THE PAY RATES, under BOTH spellings. Removing any of these blanks the crew pay
    -- estimate: the v2 branch reads hangerRate/finisherRate, the v3 branch reads
    -- prep_clean_rate, and 20 v3 quotes still carry the camelCase names too.
    'project_hanger_rate', 'project_finisher_rate',
    'hangerRate', 'finisherRate',
    'prepCleanRate', 'prep_clean_rate',
    -- structured scope the crew scope card renders
    'structuredScope', 'legacyV2Snapshot'
  );

  -- Nested arrays, each to its own allowlist. Geometry and scope only.
  IF v ? 'lineItems' THEN
    v := jsonb_set(
      v, '{lineItems}', coalesce(public.crew_safe_line_items(v -> 'lineItems'), '[]'::jsonb)
    );
  END IF;
  IF v ? 'breakdowns' THEN
    -- sqft is the one nested field crew read (crewPayBasis). itemTotal, drywallTotal and
    -- rcChannelTotal are dollar totals and stay behind.
    v := jsonb_set(v, '{breakdowns}', public.crew_safe_entries(
      v -> 'breakdowns', ARRAY['id', 'description', 'sqft', 'hangLayers', 'finishLayers']
    ));
  END IF;
  IF v ? 'insulationEntries' THEN
    v := jsonb_set(v, '{insulationEntries}', public.crew_safe_entries(
      v -> 'insulationEntries', ARRAY['id', 'type', 'face', 'sqft', 'location', 'notes']
    ));
  END IF;
  IF v ? 'metalStudEntries' THEN
    v := jsonb_set(v, '{metalStudEntries}', public.crew_safe_entries(
      v -> 'metalStudEntries',
      ARRAY['id', 'size', 'gauge', 'wallLf', 'spacing', 'wallHeight', 'tracksPerRun', 'notes']
    ));
  END IF;
  IF v ? 'rcChannelWallEntries' THEN
    v := jsonb_set(v, '{rcChannelWallEntries}', public.crew_safe_entries(
      v -> 'rcChannelWallEntries', ARRAY['id', 'height', 'linearFt']
    ));
  END IF;

  -- The snapshot is a whole frozen v2 quote with the same rate card, so it gets this same
  -- projection. Done here rather than by the caller so this function is complete on its own.
  IF v ? 'legacyV2Snapshot' THEN
    v := jsonb_set(
      v, '{legacyV2Snapshot}',
      coalesce(public.crew_safe_quote(v -> 'legacyV2Snapshot'), 'null'::jsonb)
    );
  END IF;

  RETURN v;
END;
$$;

COMMENT ON FUNCTION public.crew_safe_quote(jsonb) IS
  'Allowlist of quote fields a crew member may receive, applied at every depth. Money is '
  'excluded except the labor rates the crew pay estimate is computed from, under both the v2 '
  'and v3 spellings. New fields default to hidden — crewProjectionAllowlist.test.ts fails if '
  'the crew path reads one that is not listed here.';

REVOKE ALL ON FUNCTION public.crew_safe_quote(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crew_safe_entries(jsonb, text[]) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Prove both halves: what must survive, and what must not.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_out jsonb;
  v_live text;
  v_hits int := 0;
BEGIN
  -- 1. A v2 quote shaped like Twinsburg - Donatelli, the job that surfaced this.
  v_out := public.crew_safe_quote(jsonb_build_object(
    'version', 2,
    'sqft', 12859.35,
    'hangerRate', 0.35,
    'finisherRate', 0.45,
    'prepCleanRate', 0.05,
    'totalQuoteAmount', 0,
    'materialRate', 0.42,
    'profitPercentage', 15,
    'overheadPercentage', 10,
    'salesTaxRate', 0.065,
    'boardOnlyMaterialRate', 0.33,
    'calculations', jsonb_build_object('totalCost', 35910.34),
    'takeoffData', jsonb_build_object('secret', true),
    'bidSnapshot', jsonb_build_object('secret', true)
  ));

  IF (v_out->>'hangerRate')::numeric IS DISTINCT FROM 0.35
     OR (v_out->>'finisherRate')::numeric IS DISTINCT FROM 0.45
     OR (v_out->>'prepCleanRate')::numeric IS DISTINCT FROM 0.05 THEN
    RAISE EXCEPTION 'crew_safe_quote dropped a v2 pay rate: %', v_out;
  END IF;
  IF (v_out->>'sqft')::numeric IS DISTINCT FROM 12859.35 THEN
    RAISE EXCEPTION 'crew_safe_quote dropped sqft';
  END IF;

  -- 2. A v3 quote shaped like the live ones: snake_case scope and rate.
  v_out := public.crew_safe_quote(jsonb_build_object(
    'version', 3,
    'wall_finish', 'Level 4 Smooth',
    'ceiling_finish', 'Stomp Knockdown',
    'ceiling_finish_other', 'Level 2 Finish',
    'wall_thickness', '1/2"',
    'ceiling_thickness', '5/8"',
    'hang_exceptions', '5/8 inch at garage firewall',
    'wall_exceptions', 'Garage walls',
    'ceiling_exceptions', 'Tongue and groove',
    'custom_scope_of_work', 'Hang and Finish to Level 4',
    'prep_clean_rate', 0.05,
    'project_hanger_rate', 0.30,
    'project_finisher_rate', 0.40,
    'profit_pct', 15,
    'overhead_pct', 10,
    'rateAdjustmentLog', jsonb_build_array(jsonb_build_object('marginAtChange', 0.31))
  ));

  FOR v_live IN SELECT unnest(ARRAY[
    'wall_finish', 'ceiling_finish', 'ceiling_finish_other', 'wall_thickness',
    'ceiling_thickness', 'hang_exceptions', 'wall_exceptions', 'ceiling_exceptions',
    'custom_scope_of_work', 'prep_clean_rate', 'project_hanger_rate', 'project_finisher_rate'
  ])
  LOOP
    IF NOT (v_out ? v_live) THEN
      RAISE EXCEPTION 'crew_safe_quote dropped % which the crew scope card reads', v_live;
    END IF;
  END LOOP;

  -- 3. Nested arrays, shaped like the live rows that leaked.
  v_out := public.crew_safe_quote(jsonb_build_object(
    'version', 3,
    'breakdowns', jsonb_build_array(jsonb_build_object(
      'id', 'b1', 'description', 'Main floor', 'sqft', 4200,
      'itemTotal', 9100.5, 'drywallTotal', 8800, 'rcChannelTotal', 300.5
    )),
    'insulationEntries', jsonb_build_array(jsonb_build_object(
      'id', 'i1', 'type', 'batt', 'sqft', 800, 'materialRate', '.75'
    )),
    'alternates', jsonb_build_array(jsonb_build_object(
      'id', 'a1', 'pricingMode', 'add',
      'lineItems', jsonb_build_array(jsonb_build_object('custom_material_rate', 0.5))
    )),
    'lineItems', jsonb_build_array(jsonb_build_object(
      'id', 'l1', 'type', 'drywall', 'quantity', 1000, 'custom_hanger_rate', 0.31,
      'custom_material_rate', 0.5, 'custom_labor_rate', 0.6
    )),
    'legacyV2Snapshot', jsonb_build_object(
      'version', 2, 'sqft', 4200, 'hangerRate', 0.3, 'totalQuoteAmount', 9100.5,
      'breakdowns', jsonb_build_array(jsonb_build_object('sqft', 4200, 'itemTotal', 9100.5))
    )
  ));

  IF (v_out->'breakdowns'->0->>'sqft')::numeric IS DISTINCT FROM 4200 THEN
    RAISE EXCEPTION 'crew_safe_quote dropped breakdowns[].sqft, which crew pay reads';
  END IF;
  IF (v_out->'insulationEntries'->0->>'sqft')::numeric IS DISTINCT FROM 800 THEN
    RAISE EXCEPTION 'crew_safe_quote dropped insulation geometry';
  END IF;
  IF (v_out->'lineItems'->0->>'custom_hanger_rate')::numeric IS DISTINCT FROM 0.31 THEN
    RAISE EXCEPTION 'crew_safe_quote dropped a per-line crew rate';
  END IF;
  IF (v_out->'legacyV2Snapshot'->>'hangerRate')::numeric IS DISTINCT FROM 0.3 THEN
    RAISE EXCEPTION 'crew_safe_quote dropped the snapshot pay rate';
  END IF;
  IF v_out ? 'alternates'
     OR v_out::text ~ '"(itemTotal|drywallTotal|rcChannelTotal|materialRate|pricingMode|custom_material_rate|custom_labor_rate|totalQuoteAmount)"' THEN
    RAISE EXCEPTION 'crew_safe_quote leaked through a nested array: %', v_out;
  END IF;

  -- 4. No priced top-level field comes through on its own, under either spelling.
  FOR v_live IN SELECT unnest(ARRAY[
    'totalQuoteAmount', 'materialRate', 'boardOnlyMaterialRate', 'profitPercentage',
    'overheadPercentage', 'salesTaxRate', 'calculations', 'takeoffData', 'bidSnapshot',
    'profit_pct', 'overhead_pct', 'rateAdjustmentLog', 'alternates'
  ])
  LOOP
    IF public.crew_safe_quote(jsonb_build_object(v_live, 1)) ? v_live THEN
      RAISE EXCEPTION 'crew_safe_quote now leaks %', v_live;
    END IF;
  END LOOP;

  -- 5. On every live quote, at every depth. crew_safe_quote is complete on its own now, so
  --    this is the shape crew receive — not a partial version of it.
  FOR v_live IN
    SELECT public.crew_safe_quote(p.metadata->'legacy'->'quote')::text
    FROM public.projects p
    WHERE jsonb_typeof(p.metadata->'legacy'->'quote') = 'object'
  LOOP
    v_hits := v_hits + 1;
    IF v_live ~ '"(totalQuoteAmount|bidSnapshot|profitPercentage|overheadPercentage|materialRate|boardOnlyMaterialRate|salesTaxRate|calculations|takeoffData|profit_pct|overhead_pct|rateAdjustmentLog|itemTotal|drywallTotal|rcChannelTotal|pricingMode|alternates|custom_material_rate|custom_labor_rate|accessories_in_material_rate|override_reason)"' THEN
      RAISE EXCEPTION 'crew_safe_quote leaked on a live quote: %', left(v_live, 300);
    END IF;
  END LOOP;

  RAISE NOTICE 'crew_safe_quote: % live quotes checked; rates and scope kept, pricing withheld at every depth', v_hits;
END;
$$;

COMMIT;

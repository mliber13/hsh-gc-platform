-- The crew quote allowlist was missing thirteen fields the crew page actually reads.
--
-- 20261007120000 projected the project blob through an allowlist so a field nobody had
-- thought about defaults to hidden. Right default, one failure mode: a field the crew page
-- NEEDS goes missing and nothing says so. The page still renders, just emptier. Found a day
-- later by noticing that Twinsburg - Donatelli showed no pay rate.
--
-- Two families were missed, both because the allowlist was written against the v3 field
-- names while the blob carries both spellings:
--
--   * The v2 rate names. `hangerRate` and `finisherRate` are on 91 v2 quotes AND 20 v3
--     quotes; `resolveQuoteCatalogLaborRates` reads them in its v2 branch. Stripped, every
--     one of those jobs showed a crew pay estimate with no rate. `prep_clean_rate` — the v3
--     snake_case spelling — was missed the same way, so the v3 cleanup rate blanked too.
--
--   * The snake_case structured-scope family from D.6.6b, which the crew Scope of Work card
--     renders through `structuredScopePdf`: wall_finish (71 quotes), ceiling_finish (70),
--     wall_thickness (73), ceiling_thickness (73), hang_exceptions (62), wall_exceptions (21),
--     ceiling_exceptions (8), ceiling_finish_other (2), custom_scope_of_work (9).
--
-- No money is added. The rates are the crew's own piece rates, the stated exception, and the
-- rest is scope text and geometry. `wall_finish_other` is included for symmetry with
-- `ceiling_finish_other`: the card reads it, no live quote carries it yet.
--
-- The durable fix is not this list, it is `crewProjectionAllowlist.test.ts`, which parses the
-- deployed allowlist out of these migrations and the field reads out of the crew path and
-- fails on any gap. A hand-written list of "fields crew need" is what was already wrong.

BEGIN;

CREATE OR REPLACE FUNCTION public.crew_safe_quote(p_quote jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_quote IS NULL OR jsonb_typeof(p_quote) <> 'object' THEN NULL
    ELSE (
      SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
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
        -- line items are filtered field-by-field by crew_safe_line_items
        'lineItems', 'alternates', 'breakdowns',
        -- THE PAY RATES, under BOTH spellings. Removing any of these blanks the crew pay
        -- estimate: the v2 branch reads hangerRate/finisherRate, the v3 branch reads
        -- prep_clean_rate, and 20 v3 quotes still carry the camelCase names too.
        'project_hanger_rate', 'project_finisher_rate',
        'hangerRate', 'finisherRate',
        'prepCleanRate', 'prep_clean_rate',
        -- structured scope the crew scope card renders
        'structuredScope', 'legacyV2Snapshot'
      )
    )
  END;
$$;

COMMENT ON FUNCTION public.crew_safe_quote(jsonb) IS
  'Allowlist of quote fields a crew member may receive. Money is excluded except the labor '
  'rates the crew pay estimate is computed from, under both the v2 and v3 spellings. New '
  'fields default to hidden — crewProjectionAllowlist.test.ts fails if the crew path reads '
  'one that is not listed here.';

REVOKE ALL ON FUNCTION public.crew_safe_quote(jsonb) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Prove both halves: what must survive, and what must not.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_out jsonb;
  v_live text;
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

  -- 3. And nothing priced came along for the ride, under either spelling.
  FOR v_live IN SELECT unnest(ARRAY[
    'totalQuoteAmount', 'materialRate', 'boardOnlyMaterialRate', 'profitPercentage',
    'overheadPercentage', 'salesTaxRate', 'calculations', 'takeoffData', 'bidSnapshot',
    'profit_pct', 'overhead_pct', 'rateAdjustmentLog'
  ])
  LOOP
    IF v_out ? v_live OR public.crew_safe_quote(jsonb_build_object(v_live, 1)) ? v_live THEN
      RAISE EXCEPTION 'crew_safe_quote now leaks %', v_live;
    END IF;
  END LOOP;

  -- 4. On every live quote: the projection must carry no priced field at all.
  FOR v_live IN
    SELECT public.crew_safe_quote(p.metadata->'legacy'->'quote')::text
    FROM public.projects p
    WHERE jsonb_typeof(p.metadata->'legacy'->'quote') = 'object'
  LOOP
    IF v_live ~ '"(totalQuoteAmount|bidSnapshot|profitPercentage|overheadPercentage|materialRate|boardOnlyMaterialRate|salesTaxRate|calculations|takeoffData|profit_pct|overhead_pct|rateAdjustmentLog)"' THEN
      RAISE EXCEPTION 'crew_safe_quote leaked on a live quote: %', left(v_live, 300);
    END IF;
  END LOOP;

  RAISE NOTICE 'crew_safe_quote: rates and scope kept, pricing withheld';
END;
$$;

COMMIT;

-- Ceiling heights reach the crew (Mark, 2026-10-15: "so they know exactly what to expect when they
-- get there"). Heights are geometry, not money: a quote line's height_ft (filled by the Togal
-- import from the wall labels) and the quote's default_height_ft. Measured area heights already
-- reach crew — crew_safe_field_takeoff passes measurements whole.
--
-- Both functions are re-created from their latest definitions (crew_safe_quote from
-- 20261008130000, crew_safe_line_items from 20261007120000) with one key added each.
-- crewProjectionAllowlist.test.ts reads the LAST definition, so it checks these lists.

CREATE OR REPLACE FUNCTION public.crew_safe_line_items(p_items jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN p_items
    ELSE coalesce(
      (
        SELECT jsonb_agg(
          (
            SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
            FROM jsonb_each(item) AS f(k, v)
            WHERE k IN (
              'id', 'type', 'location', 'description', 'notes',
              'quantity', 'unit', 'waste_pct', 'catalog_id',
              'thickness', 'board_type', 'finish_scope_id',
              'hang_ceiling_thickness', 'hang_wall_thickness',
              'finish_level', 'duration_days',
              -- ceiling height of the space (2026-10-15), for the crew Ceiling heights card
              'height_ft',
              -- per-line crew pay overrides, same reason as the project rates
              'custom_hanger_rate', 'custom_finisher_rate'
            )
          )
          ORDER BY ord
        )
        FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(item, ord)
      ),
      '[]'::jsonb
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.crew_safe_line_items(jsonb) FROM PUBLIC;

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
    -- ceiling height for most of the job (2026-10-15) — the crew Ceiling heights card reads it.
    'default_height_ft',
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

REVOKE ALL ON FUNCTION public.crew_safe_quote(jsonb) FROM PUBLIC;

-- Prove it: the heights pass, and money still does not.
DO $$
DECLARE
  v jsonb;
BEGIN
  v := public.crew_safe_quote(jsonb_build_object(
    'version', 3,
    'default_height_ft', 9,
    'profit_pct', 30,
    'lineItems', jsonb_build_array(jsonb_build_object(
      'id', 'g', 'type', 'drywall', 'location', 'Great Room', 'quantity', 1200,
      'height_ft', 18, 'custom_material_rate', 0.62
    ))
  ));
  IF (v ->> 'default_height_ft')::numeric IS DISTINCT FROM 9 THEN
    RAISE EXCEPTION 'crew_safe_quote dropped default_height_ft';
  END IF;
  IF (v -> 'lineItems' -> 0 ->> 'height_ft')::numeric IS DISTINCT FROM 18 THEN
    RAISE EXCEPTION 'crew_safe_line_items dropped height_ft';
  END IF;
  IF v ? 'profit_pct' OR (v -> 'lineItems' -> 0) ? 'custom_material_rate' THEN
    RAISE EXCEPTION 'crew projection let money through';
  END IF;
END $$;

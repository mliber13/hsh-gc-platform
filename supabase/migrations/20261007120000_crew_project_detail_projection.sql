-- ============================================================================
-- Crew job detail — a server-side projection instead of the whole project row
-- ============================================================================
--
-- The crew job-detail page calls `fetchDrywallProjectById`, which returns the entire
-- `projects` row including all of `metadata.legacy`. The page reads a handful of things out
-- of it and discards the rest — but the discard happens on the phone, AFTER it has arrived.
--
-- Measured 2026-10-07 on the 33 projects with crew assigned: a crew member receives up to
-- 52.7 KB per job containing, among other things, roughly 45 money-bearing quote fields —
-- `totalQuoteAmount`, `bidSnapshot`, `profitPercentage`, `overheadPercentage`,
-- `salesTaxRate`, `materialRate` and the whole component rate card. That is the pricing
-- model and the margin structure, not just a job total.
--
-- This is a DISCLOSURE fix, not a size one. Trimming to exactly what the page needs saves
-- only ~10% of the bytes, because the bulk is the field takeoff and the quote's line items,
-- which crew genuinely use. The point is what stops being sent, not how much.
--
-- **Why an allowlist, and why server-side.** The quote carries ~130 fields. A column list in
-- the client would have to enumerate the ~85 safe ones and stay in sync forever, with every
-- new field defaulting to EXPOSED. Here the default is hidden: a field nobody has thought
-- about does not reach a phone.
--
-- **Crew pay depends on three of the money fields and they are deliberately kept.**
-- `resolveQuoteCatalogLaborRates` computes the crew pay estimate from `project_hanger_rate`,
-- `project_finisher_rate` and the per-line `custom_hanger_rate` / `custom_finisher_rate`,
-- falling back to the catalog. Dropping those blanks the pay display on live jobs — the
-- exact failure a Batch 1B note warned about after it was nearly shipped once.
--
-- The returned shape is the SAME as before, just with fewer keys, so the thirteen helpers in
-- `crewWorkspaceService` that take a `legacy` object keep working untouched.

BEGIN;

-- ---------------------------------------------------------------------------
-- Quote fields a crew member may see.
--
-- Scope, geometry, quantities and the labor rates they are paid at. Everything absent is
-- hidden, which is the point — notably totalQuoteAmount, bidSnapshot, profitPercentage,
-- overheadPercentage, salesTaxRate, materialRate, calculations, and every component and
-- material rate.
-- ---------------------------------------------------------------------------
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
        'use_custom_scope_of_work', 'quoteIncludes', 'notes', 'drywallScope', 'buildType',
        'build_type', 'complexity',
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
        -- line items are filtered field-by-field below
        'lineItems', 'alternates', 'breakdowns',
        -- THE THREE PAY RATES. Removing these blanks the crew pay estimate.
        'project_hanger_rate', 'project_finisher_rate', 'prepCleanRate',
        -- structured scope the crew scope card renders
        'structuredScope', 'legacyV2Snapshot'
      )
    )
  END;
$$;

COMMENT ON FUNCTION public.crew_safe_quote(jsonb) IS
  'Allowlist of quote fields a crew member may receive. Money is excluded except the three '
  'labor rates the crew pay estimate is computed from. New fields default to hidden.';

-- ---------------------------------------------------------------------------
-- Line items: scope and quantity, plus the per-line crew rate overrides.
-- Drops custom_material_rate and anything else priced.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- The field takeoff: site info, measurements and the crew's own approved pay rates.
--
-- Two keys are deliberately absent. `rateAdjustmentLog` records every labor-rate change with
-- `marginAtChange`, who made it and why — an operator audit trail, and the margin is exactly
-- what a crew member should not be handed. `reviewBaselineRates` is the rate before the
-- adjustment, which nobody on site needs either.
--
-- `reviewApprovedRates` STAYS: {hangerRate, finisherRate, prepCleanRate} is what the crew pay
-- estimate reads once a measurement is approved.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crew_safe_field_takeoff(p_takeoff jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_takeoff IS NULL OR jsonb_typeof(p_takeoff) <> 'object' THEN p_takeoff
    ELSE (
      SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
      FROM jsonb_each(p_takeoff)
      WHERE key IN (
        'updatedAt', 'notes', 'photos', 'checklist', 'accessories', 'measurements',
        'materialsNeeded', 'totalMeasuredSqft', 'varianceNotes',
        'hazards', 'accessNotes', 'siteContact', 'contactPhone', 'meetingLocation',
        'signedOffBy', 'signedOffDate',
        'reviewStatus', 'submittedForReviewAt', 'approvedAt', 'rejectedAt', 'rejectionNotes',
        'reviewApprovedRates'
      )
    )
  END;
$$;

COMMENT ON FUNCTION public.crew_safe_field_takeoff(jsonb) IS
  'Allowlist of field-takeoff fields a crew member may receive. Excludes rateAdjustmentLog '
  '(carries marginAtChange) and reviewBaselineRates; keeps reviewApprovedRates for crew pay.';

REVOKE ALL ON FUNCTION public.crew_safe_field_takeoff(jsonb) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- The crew's view of a project.
--
-- SECURITY DEFINER so the allowlist cannot be bypassed by the caller, with the same
-- visibility rule the rest of the crew surface uses: assigned to the project, or an operator
-- previewing it. An operator preview deliberately gets the SAME sanitised shape — the point
-- of the preview is to see what the crew sees.
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
  v_legacy jsonb;
  v_safe jsonb;
  v_quote jsonb;
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

  v_legacy := coalesce(v_row.metadata -> 'legacy', '{}'::jsonb);

  -- Legacy keys the crew detail path reads, via the thirteen helpers that take `legacy`.
  -- Absent and therefore no longer sent: every quote_v3_archive, changeOrders,
  -- below_floor_approvals, commsLog, variance, audit, order, delivery, legacyId,
  -- productionTimestamps, _fromSupabase.
  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    INTO v_safe
  FROM jsonb_each(v_legacy)
  WHERE key IN (
    'id', 'name', 'client', 'address', 'status', 'notes',
    'fieldTakeoff', 'fieldMeasurementPrep', 'orders', 'poData', 'po', 'intakeSource'
  );

  IF v_safe ? 'fieldTakeoff' THEN
    v_safe := jsonb_set(
      v_safe, '{fieldTakeoff}', public.crew_safe_field_takeoff(v_safe -> 'fieldTakeoff'), true
    );
  END IF;

  v_quote := public.crew_safe_quote(v_legacy -> 'quote');
  IF v_quote IS NOT NULL THEN
    v_quote := jsonb_set(
      v_quote, '{lineItems}', public.crew_safe_line_items(v_quote -> 'lineItems'), true
    );
    IF v_quote ? 'legacyV2Snapshot' THEN
      -- The snapshot is a whole frozen v2 quote and carries the same rate card.
      v_quote := jsonb_set(
        v_quote,
        '{legacyV2Snapshot}',
        public.crew_safe_quote(v_quote -> 'legacyV2Snapshot'),
        true
      );
    END IF;
    v_safe := jsonb_set(v_safe, '{quote}', v_quote, true);
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'address', v_row.address,
    'client', v_row.client,
    'status', v_row.status,
    'legacy', v_safe
  );
END;
$$;

COMMENT ON FUNCTION public.crew_project_detail(uuid) IS
  'Crew-safe projection of a project for the /crew job detail. Returns the same shape as the '
  'full read with money and unrelated keys removed; see crew_safe_quote for the allowlist.';

REVOKE ALL ON FUNCTION public.crew_project_detail(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crew_safe_quote(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crew_safe_line_items(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crew_project_detail(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Verification — the guard has to be watched failing, not assumed.
-- A projection that silently returns everything is worse than none, because it looks fixed.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_quote jsonb;
  v_out jsonb;
BEGIN
  -- A quote carrying one safe field and several money ones.
  v_quote := jsonb_build_object(
    'version', 3,
    'sqft', 1000,
    'project_hanger_rate', 0.42,
    'totalQuoteAmount', 32843.42,
    'profitPercentage', 12,
    'overheadPercentage', 8,
    'materialRate', 0.69,
    'bidSnapshot', jsonb_build_object('total', 32843.42),
    'lineItems', jsonb_build_array(
      jsonb_build_object(
        'id', 'l1', 'type', 'drywall', 'quantity', 100,
        'custom_hanger_rate', 0.4, 'custom_material_rate', 0.69
      )
    )
  );

  v_out := public.crew_safe_quote(v_quote);

  IF v_out ? 'totalQuoteAmount' OR v_out ? 'profitPercentage'
     OR v_out ? 'overheadPercentage' OR v_out ? 'bidSnapshot'
     OR v_out ? 'materialRate' THEN
    RAISE EXCEPTION 'crew_safe_quote leaked a money field: %', v_out;
  END IF;

  IF NOT (v_out ? 'sqft') OR NOT (v_out ? 'project_hanger_rate') THEN
    RAISE EXCEPTION 'crew_safe_quote dropped something crew need: %', v_out;
  END IF;

  v_out := public.crew_safe_line_items(v_quote -> 'lineItems');
  IF v_out -> 0 ? 'custom_material_rate' THEN
    RAISE EXCEPTION 'crew_safe_line_items leaked a material rate: %', v_out;
  END IF;
  IF NOT (v_out -> 0 ? 'custom_hanger_rate') OR NOT (v_out -> 0 ? 'quantity') THEN
    RAISE EXCEPTION 'crew_safe_line_items dropped something crew need: %', v_out;
  END IF;

  -- The field takeoff's own money: the margin log must go, the approved rates must stay.
  v_out := public.crew_safe_field_takeoff(jsonb_build_object(
    'totalMeasuredSqft', 4905,
    'measurements', jsonb_build_array(),
    'reviewApprovedRates', jsonb_build_object('hangerRate', 0.28, 'finisherRate', 0.45),
    'reviewBaselineRates', jsonb_build_object('hangerRate', 0.27),
    'rateAdjustmentLog', jsonb_build_array(jsonb_build_object('marginAtChange', 0.31))
  ));
  IF v_out ? 'rateAdjustmentLog' OR v_out ? 'reviewBaselineRates' THEN
    RAISE EXCEPTION 'crew_safe_field_takeoff leaked the rate audit: %', v_out;
  END IF;
  IF NOT (v_out ? 'reviewApprovedRates') OR NOT (v_out ? 'totalMeasuredSqft') THEN
    RAISE EXCEPTION 'crew_safe_field_takeoff dropped something crew need: %', v_out;
  END IF;

  RAISE NOTICE 'crew projection verified: money excluded, pay rates and scope kept';
END
$verify$;

COMMIT;

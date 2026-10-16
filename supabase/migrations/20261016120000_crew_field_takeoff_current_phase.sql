-- Crew measurers see which phase is being measured (docs/briefs/FIELD_PHASES.md, step 1).
-- A phase number, not money. Areas already carry their own phase inside measurements, which
-- this function passes whole; the takeoff-level currentPhase was the one key missing, so after
-- the office started Phase 2 a measurer's new area would have been filed under Phase 1.
--
-- Re-created from its only definition (20261007120000) with one key added.

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
        'reviewApprovedRates',
        -- the phase being measured (fieldPhases.ts, 2026-10-16) — so a crew measurer's new areas
        -- land in the phase the office started, not Phase 1
        'currentPhase'
      )
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.crew_safe_field_takeoff(jsonb) FROM PUBLIC;

DO $$
DECLARE
  v jsonb;
BEGIN
  v := public.crew_safe_field_takeoff(jsonb_build_object(
    'currentPhase', 2,
    'rateAdjustmentLog', jsonb_build_array(jsonb_build_object('marginAtChange', 0.31))
  ));
  IF (v ->> 'currentPhase')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'crew_safe_field_takeoff dropped currentPhase';
  END IF;
  IF v ? 'rateAdjustmentLog' THEN
    RAISE EXCEPTION 'crew_safe_field_takeoff let the rate log (margin) through';
  END IF;
END $$;

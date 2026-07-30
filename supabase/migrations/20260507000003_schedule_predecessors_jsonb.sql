-- ============================================================
-- Schedule redesign Step 3: multi-predecessor with lag
-- ============================================================
-- Per docs/SCHEDULE_TARGET_MODEL.md §10 step 3 + §5.2.
--
-- Replaces the schedule_items.predecessor_ids uuid[] with a richer
-- JSONB array of { predecessor_id, lag_days } objects. Lag is in
-- work days (per construction-software convention; cascade math in
-- Step 4 will interpret it via workday-aware date arithmetic).
--
-- Existing predecessor_ids array is kept as rollback fallback.
-- Service layer stops writing to it; reads go through predecessors
-- only. Drop in a follow-up migration once read paths verified.
--
-- Default relation type is FS (finish-to-start) — SS/FF deferred.
-- ============================================================

BEGIN;

ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS predecessors jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.schedule_items si
SET predecessors = COALESCE(
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'predecessor_id', pred_id,
        'lag_days', 0
      )
    )
    FROM unnest(si.predecessor_ids) AS pred_id
    WHERE pred_id IS NOT NULL
  ),
  '[]'::jsonb
)
WHERE jsonb_array_length(si.predecessors) = 0
  AND array_length(si.predecessor_ids, 1) > 0;

DO $$
BEGIN
  CREATE OR REPLACE FUNCTION public.is_valid_schedule_predecessors(data jsonb)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  AS $fn$
    SELECT
      jsonb_typeof(data) = 'array'
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(data) AS elem
        WHERE elem->>'predecessor_id' IS NULL
           OR elem->>'lag_days' IS NULL
           OR (elem->>'lag_days') !~ '^-?[0-9]+$'
      );
  $fn$;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'schedule_items_predecessors_shape'
      AND conrelid = 'public.schedule_items'::regclass
  ) THEN
    ALTER TABLE public.schedule_items
      ADD CONSTRAINT schedule_items_predecessors_shape
      CHECK (public.is_valid_schedule_predecessors(predecessors));
  END IF;
END
$$;

COMMIT;

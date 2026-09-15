-- Schedule unification Step 2: stamp each item with the division of the
-- surface that created it. Garden of Eatin's abandoned GC schedule is the
-- only non-drywall data; delete it so the DEFAULT backfill is unconditional.

BEGIN;

DELETE FROM public.schedule_items
WHERE project_id = 'fa72c3da-73de-4174-b2ef-f09fa8de7657';

DELETE FROM public.schedules
WHERE id = '9eb9f481-4971-4513-bbf9-932123b94dc3'
  AND project_id = 'fa72c3da-73de-4174-b2ef-f09fa8de7657';

ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS division text NOT NULL DEFAULT 'drywall'
  CHECK (division IN ('gc', 'drywall'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.schedule_items WHERE division IS DISTINCT FROM 'drywall'
  ) THEN
    RAISE EXCEPTION 'schedule_items.division backfill failed: expected every surviving row to be drywall';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_schedule_items_org_division_start_date
  ON public.schedule_items (organization_id, division, start_date);

COMMENT ON COLUMN public.schedule_items.division IS
  'Stamped at creation from the surface that created the row, never derived from project classification.';

COMMIT;

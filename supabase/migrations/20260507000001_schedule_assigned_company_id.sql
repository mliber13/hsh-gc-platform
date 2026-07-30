-- ============================================================
-- Schedule redesign Step 2: assigned_company_id + is_internal flag
-- ============================================================
-- Per docs/SCHEDULE_TARGET_MODEL.md §10 step 2 + §5.2.
--
-- Adds the schedule_items.assigned_company_id FK to subcontractors
-- and the subcontractors.is_internal flag distinguishing 1099-
-- exclusive HSH crews from external subs. Backfills existing
-- schedule_items to point at a per-org "In-house" sentinel row
-- created idempotently (skip if any internal sub already exists
-- for that org).
--
-- assigned_company_id is nullable and ON DELETE SET NULL — deleting
-- a subcontractor doesn't cascade through to schedule data.
-- ============================================================

BEGIN;

ALTER TABLE public.subcontractors
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_subcontractors_is_internal
  ON public.subcontractors(organization_id, is_internal)
  WHERE is_internal = true;

ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS assigned_company_id uuid
    REFERENCES public.subcontractors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_items_assigned_company_id
  ON public.schedule_items(assigned_company_id);

INSERT INTO public.subcontractors (organization_id, name, is_internal)
SELECT DISTINCT si.organization_id, 'In-house', true
FROM public.schedule_items si
WHERE NOT EXISTS (
  SELECT 1
  FROM public.subcontractors sub
  WHERE sub.organization_id = si.organization_id
    AND sub.is_internal = true
);

UPDATE public.schedule_items si
SET assigned_company_id = (
  SELECT sub.id
  FROM public.subcontractors sub
  WHERE sub.organization_id = si.organization_id
    AND sub.is_internal = true
  ORDER BY sub.created_at ASC
  LIMIT 1
)
WHERE si.assigned_company_id IS NULL;

COMMIT;

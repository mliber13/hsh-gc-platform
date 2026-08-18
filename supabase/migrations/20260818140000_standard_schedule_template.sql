-- ============================================================
-- Configurable "Generate standard schedule" template
-- ============================================================
-- The standard drywall schedule (Measure → Stock → … → Bill Complete) was a
-- hardcoded array. Store it per-org so the office can set each step's default
-- assignee, duration, and lag from Settings without a code change. NULL = fall
-- back to the built-in default template in app code.
-- ============================================================

ALTER TABLE public.org_drywall_catalogs
  ADD COLUMN IF NOT EXISTS standard_schedule_template jsonb;

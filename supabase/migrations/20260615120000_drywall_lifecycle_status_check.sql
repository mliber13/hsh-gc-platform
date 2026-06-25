-- D.1.1 — Widen projects.status CHECK to allow drywall lifecycle values
-- Anchor: docs/DRYWALL_D1_IMPLEMENTATION_BRIEFS.md (D.1.1 lifecycle states)
--
-- Adds:
--   'field-measurement' — was missing from prior constraint (silently hidden because
--                         saveFieldTakeoffAndAdvance jumps Quote → Order directly)
--   'production'        — new drywall lifecycle state (Order → Production)
--   'production-complete' — new drywall lifecycle state (Production → Production Complete)
--   'closed'            — new drywall terminal state, replaces legacy 'complete' for new closures
--
-- Keeps:
--   'complete' — backward compat for existing drywall rows already at this terminal state.
--                Read-time normalizer in TypeScript maps 'complete' → 'closed' for display.
--                No data migration; existing rows untouched.

BEGIN;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_status_check
  CHECK (
    status IN (
      -- GC / shared
      'planning',
      'estimating',
      'in-progress',
      'lost',
      -- Drywall workflow (existing)
      'project-info',
      'quote',
      'field-measurement',
      'order',
      -- Drywall lifecycle (new — D.1.1)
      'production',
      'production-complete',
      'closed',
      -- Legacy terminal — backward compat for existing rows
      'complete'
    )
  );

COMMIT;

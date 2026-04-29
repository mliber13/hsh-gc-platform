-- ============================================================
-- Gameplan retirement: drop the 3 gameplan tables
-- ============================================================
-- Owner reports never having used Gameplan in production. The 109 prod
-- rows across the 3 tables are test/seed data from initial exploration.
-- Schedule (ScheduleBuilder) covers the actual scheduling workflow.
--
-- Data preserved as JSON exports BEFORE this migration runs:
--   scripts/archive/gameplan_plays_export_2026-04-29.json (37 rows)
--   scripts/archive/gameplan_playbook_export_2026-04-29.json (35 rows)
--   scripts/archive/gameplan_default_playbook_export_2026-04-29.json (37 rows)
--
-- App-side cleanup committed alongside this migration:
--   - GameplanBoard.tsx + DefaultPlaybookManager.tsx (deleted)
--   - src/types/gameplan.ts (deleted)
--   - 15 functions in supabaseService.ts (removed)
--   - 16 hybrid wrappers in hybridService.ts (removed)
--   - GameplanBoard import + render in ProjectDetailView.tsx (removed)
--
-- See docs/GAMEPLAN_RETIREMENT.md for the full plan + rollback notes.
-- ============================================================

BEGIN;

-- Pre-flight: confirm tables exist before drop (sanity check that this
-- migration is being run against a state where retirement is meaningful)
DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'gameplan_plays'
  ) THEN
    RAISE EXCEPTION 'gameplan_retire: gameplan_plays already gone — was this already run?';
  END IF;
END
$check$;

-- Drop the 3 tables. CASCADE drops:
--   - RLS policies created in A5-c.2 chunk C2-10 (4 policies per table = 12 policies)
--   - FK constraints to organizations(id) added in A5-e
--   - any triggers (updated_at, etc.)
DROP TABLE IF EXISTS public.gameplan_plays CASCADE;
DROP TABLE IF EXISTS public.gameplan_playbook CASCADE;
DROP TABLE IF EXISTS public.gameplan_default_playbook CASCADE;

-- Post-check: all three tables must be gone
DO $postcheck$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('gameplan_plays', 'gameplan_playbook', 'gameplan_default_playbook')
  ) THEN
    RAISE EXCEPTION 'gameplan_retire: at least one gameplan table still exists post-drop';
  END IF;
END
$postcheck$;

COMMIT;

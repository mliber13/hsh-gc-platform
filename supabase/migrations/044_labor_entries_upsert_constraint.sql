-- ============================================================================
-- Labor entries: full unique constraint so Supabase/PostgREST upsert works
-- PostgREST does not support ON CONFLICT with partial unique indexes.
-- A full UNIQUE(source_system, source_id) still allows multiple (manual, NULL).
-- ============================================================================

DROP INDEX IF EXISTS idx_labor_entries_source_idempotent;

ALTER TABLE labor_entries
  ADD CONSTRAINT labor_entries_source_system_source_id_key UNIQUE (source_system, source_id);

COMMENT ON CONSTRAINT labor_entries_source_system_source_id_key ON labor_entries IS
  'Idempotent QBO import: one row per (source_system, source_id). Multiple (manual, NULL) allowed.';

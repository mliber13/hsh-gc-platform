-- ============================================================================
-- Labor import batches: snapshot, created_by, status (production hardening)
-- ============================================================================

ALTER TABLE labor_import_batches
  ADD COLUMN IF NOT EXISTS account_ids_snapshot TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed'));

COMMENT ON COLUMN labor_import_batches.account_ids_snapshot IS 'Wage allocation account IDs used for this import (audit)';
COMMENT ON COLUMN labor_import_batches.created_by IS 'User who ran the import';
COMMENT ON COLUMN labor_import_batches.status IS 'completed or failed';

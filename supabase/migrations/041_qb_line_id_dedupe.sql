-- ============================================================================
-- QuickBooks import: line-level dedupe (reconcile to COGS + Expense)
-- ============================================================================
-- Uniqueness per (qb_transaction_id, qb_transaction_type, qb_line_id) so we
-- never drop a legitimate transaction when one Check/Bill has multiple lines/jobs.
-- ============================================================================

ALTER TABLE material_entries
ADD COLUMN IF NOT EXISTS qb_line_id TEXT;

ALTER TABLE subcontractor_entries
ADD COLUMN IF NOT EXISTS qb_line_id TEXT;

COMMENT ON COLUMN material_entries.qb_line_id IS 'QuickBooks line id when transaction has multiple lines (e.g. check split across jobs); used for dedupe';
COMMENT ON COLUMN subcontractor_entries.qb_line_id IS 'QuickBooks line id when transaction has multiple lines; used for dedupe';

CREATE UNIQUE INDEX IF NOT EXISTS idx_material_entries_qb_txn_line
  ON material_entries(qb_transaction_type, qb_transaction_id, COALESCE(qb_line_id, ''))
  WHERE qb_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subcontractor_entries_qb_txn_line
  ON subcontractor_entries(qb_transaction_type, qb_transaction_id, COALESCE(qb_line_id, ''))
  WHERE qb_transaction_id IS NOT NULL;

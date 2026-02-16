-- ============================================================================
-- QuickBooks Import: project linking and transaction tracking
-- ============================================================================
-- For "Import from QuickBooks" / pending list:
-- - Link app projects to QB Projects (job) so we know which QB transactions belong to which app project
-- - Track which QB transactions we've already imported so we can show a pending list
-- ============================================================================

-- Link app project to QuickBooks Project (job) for resolving "this bill is for QB Project X"
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS qb_project_id TEXT,
ADD COLUMN IF NOT EXISTS qb_project_name TEXT;

COMMENT ON COLUMN projects.qb_project_id IS 'QuickBooks Online Project (job) id; used to match QB transactions to this app project';
COMMENT ON COLUMN projects.qb_project_name IS 'QuickBooks Project display name (denormalized for UI)';

-- Track which QB transaction each material/sub entry came from (so we can build "pending" list and avoid re-import)
ALTER TABLE material_entries
ADD COLUMN IF NOT EXISTS qb_transaction_id TEXT,
ADD COLUMN IF NOT EXISTS qb_transaction_type TEXT;

ALTER TABLE subcontractor_entries
ADD COLUMN IF NOT EXISTS qb_transaction_id TEXT,
ADD COLUMN IF NOT EXISTS qb_transaction_type TEXT;

COMMENT ON COLUMN material_entries.qb_transaction_id IS 'QuickBooks transaction id (Bill, Purchase, Check, VendorCredit) this entry was imported from';
COMMENT ON COLUMN material_entries.qb_transaction_type IS 'QuickBooks entity type: Bill, Purchase, Check, VendorCredit';
COMMENT ON COLUMN subcontractor_entries.qb_transaction_id IS 'QuickBooks transaction id this entry was imported from';
COMMENT ON COLUMN subcontractor_entries.qb_transaction_type IS 'QuickBooks entity type: Bill, Purchase, Check, VendorCredit';

CREATE INDEX IF NOT EXISTS idx_projects_qb_project_id ON projects(qb_project_id);
CREATE INDEX IF NOT EXISTS idx_material_entries_qb_transaction ON material_entries(qb_transaction_id) WHERE qb_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subcontractor_entries_qb_transaction ON subcontractor_entries(qb_transaction_id) WHERE qb_transaction_id IS NOT NULL;

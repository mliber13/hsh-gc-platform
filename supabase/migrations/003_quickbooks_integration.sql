-- ============================================================================
-- QuickBooks Integration Migration
-- ============================================================================
-- 
-- Adds QuickBooks OAuth tokens and configuration to user profiles
--

-- Add QuickBooks fields to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS qb_access_token TEXT,
ADD COLUMN IF NOT EXISTS qb_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS qb_realm_id TEXT,
ADD COLUMN IF NOT EXISTS qb_token_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS qb_connected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS qb_company_name TEXT;

-- Add QB sync tracking to actuals entries
ALTER TABLE labor_entries
ADD COLUMN IF NOT EXISTS qb_sync_status TEXT DEFAULT 'pending' CHECK (qb_sync_status IN ('pending', 'synced', 'failed', 'disabled')),
ADD COLUMN IF NOT EXISTS qb_check_id TEXT,
ADD COLUMN IF NOT EXISTS qb_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS qb_sync_error TEXT;

ALTER TABLE material_entries
ADD COLUMN IF NOT EXISTS qb_sync_status TEXT DEFAULT 'pending' CHECK (qb_sync_status IN ('pending', 'synced', 'failed', 'disabled')),
ADD COLUMN IF NOT EXISTS qb_check_id TEXT,
ADD COLUMN IF NOT EXISTS qb_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS qb_sync_error TEXT;

ALTER TABLE subcontractor_entries
ADD COLUMN IF NOT EXISTS qb_sync_status TEXT DEFAULT 'pending' CHECK (qb_sync_status IN ('pending', 'synced', 'failed', 'disabled')),
ADD COLUMN IF NOT EXISTS qb_check_id TEXT,
ADD COLUMN IF NOT EXISTS qb_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS qb_sync_error TEXT;

-- Create indexes for sync status queries
CREATE INDEX IF NOT EXISTS idx_labor_entries_qb_sync ON labor_entries(qb_sync_status);
CREATE INDEX IF NOT EXISTS idx_material_entries_qb_sync ON material_entries(qb_sync_status);
CREATE INDEX IF NOT EXISTS idx_subcontractor_entries_qb_sync ON subcontractor_entries(qb_sync_status);

-- Create a view to see all unsynced entries
CREATE OR REPLACE VIEW unsynced_qb_entries AS
SELECT 
  'labor' as entry_type,
  id,
  project_id,
  description,
  amount,
  date,
  qb_sync_status,
  qb_sync_error
FROM labor_entries
WHERE qb_sync_status = 'pending' OR qb_sync_status = 'failed'
UNION ALL
SELECT 
  'material' as entry_type,
  id,
  project_id,
  description,
  amount,
  date,
  qb_sync_status,
  qb_sync_error
FROM material_entries
WHERE qb_sync_status = 'pending' OR qb_sync_status = 'failed'
UNION ALL
SELECT 
  'subcontractor' as entry_type,
  id,
  project_id,
  description,
  amount,
  date,
  qb_sync_status,
  qb_sync_error
FROM subcontractor_entries
WHERE qb_sync_status = 'pending' OR qb_sync_status = 'failed'
ORDER BY date DESC;


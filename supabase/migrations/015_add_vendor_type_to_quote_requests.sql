-- ============================================================================
-- Add vendor_type to quote_requests
-- ============================================================================

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS vendor_type TEXT NOT NULL DEFAULT 'subcontractor';

-- Backfill any existing rows in case the column existed without data
UPDATE quote_requests
SET vendor_type = 'subcontractor'
WHERE vendor_type IS NULL;



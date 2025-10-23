-- ============================================================================
-- Migration: Add Estimate Status Tracking
-- ============================================================================
-- 
-- Adds status tracking to distinguish budget estimates from real quotes
-- Includes metadata fields for vendor, quote date, and PDF attachment
--

-- Add estimate status tracking columns to trades table
ALTER TABLE trades ADD COLUMN estimate_status TEXT DEFAULT 'budget';
ALTER TABLE trades ADD COLUMN quote_vendor TEXT;
ALTER TABLE trades ADD COLUMN quote_date DATE;
ALTER TABLE trades ADD COLUMN quote_reference TEXT;
ALTER TABLE trades ADD COLUMN quote_file_url TEXT;

-- Add check constraint for valid statuses
ALTER TABLE trades ADD CONSTRAINT trades_estimate_status_check 
  CHECK (estimate_status IN ('budget', 'quoted', 'approved'));

-- Backfill existing records with 'budget' status
UPDATE trades SET estimate_status = 'budget' WHERE estimate_status IS NULL;

-- Add indexes for filtering by status
CREATE INDEX idx_trades_estimate_status ON trades(estimate_status);
CREATE INDEX idx_trades_quote_date ON trades(quote_date);

-- Add comments for documentation
COMMENT ON COLUMN trades.estimate_status IS 'Status of estimate: budget (rough), quoted (vendor quote received), or approved (quote accepted)';
COMMENT ON COLUMN trades.quote_vendor IS 'Vendor or subcontractor name for quoted items';
COMMENT ON COLUMN trades.quote_date IS 'Date the quote was received';
COMMENT ON COLUMN trades.quote_reference IS 'Quote or proposal number for reference';
COMMENT ON COLUMN trades.quote_file_url IS 'URL to attached quote PDF document in Supabase Storage';


-- ============================================================================
-- Migration: Add Subcontractor Rate to Trades and Sub-Items
-- ============================================================================
--
-- Adds subcontractor_rate column to trades and sub_items tables
-- to support unit-based subcontractor cost calculations (rate * quantity)
--

-- Add subcontractor_rate to trades table
ALTER TABLE trades
ADD COLUMN IF NOT EXISTS subcontractor_rate NUMERIC(12, 2);

-- Add subcontractor_rate to sub_items table
ALTER TABLE sub_items
ADD COLUMN IF NOT EXISTS subcontractor_rate NUMERIC(12, 2);

-- Create indexes for faster lookups (optional, but helpful for queries)
CREATE INDEX IF NOT EXISTS idx_trades_subcontractor_rate ON trades(subcontractor_rate) WHERE subcontractor_rate IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sub_items_subcontractor_rate ON sub_items(subcontractor_rate) WHERE subcontractor_rate IS NOT NULL;

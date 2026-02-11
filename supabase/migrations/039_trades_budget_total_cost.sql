-- ============================================================================
-- Add budget_total_cost to trades (Budget vs Quote vs Actual)
-- ============================================================================
-- Preserves the estimate-book amount when an accepted quote overwrites total_cost.
-- Budget = original estimate; Quote = accepted quote amount; Actual = from project actuals.
--

ALTER TABLE trades
ADD COLUMN IF NOT EXISTS budget_total_cost NUMERIC(12, 2);

COMMENT ON COLUMN trades.budget_total_cost IS 'Original estimate-book amount; preserved when accepting a quote so we can compare Budget vs Quote vs Actual';

-- Backfill: for trades that have quoted/approved status, set budget to current total
-- so existing data has a budget value (before we had the column, total_cost was overwritten)
UPDATE trades
SET budget_total_cost = total_cost
WHERE estimate_status IN ('quoted', 'approved') AND (budget_total_cost IS NULL OR budget_total_cost = 0);

-- Item-level selections on trades
-- Allows attaching structured selection data (e.g. siding, gutters, soffit) directly to a cost item.

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS selection JSONB DEFAULT NULL;

COMMENT ON COLUMN trades.selection IS 'Structured selection data for this trade (e.g. product, color, system); shape varies by use.';


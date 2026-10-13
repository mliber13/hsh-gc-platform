-- GC labor source decision, 2026-10-13 (docs/briefs/GC_LABOR_SOURCE_DECISION.md).
--
-- GC actuals now read payroll lines tagged GC live from pay_periods, and keep the QuickBooks
-- labor import (labor_entries, source_system 'qbo') as history from before payroll ran in the
-- app. Where a QBO row is the same wages a payroll line already counts, it must stop counting
-- — but is not deleted: it is the record of what QuickBooks held.
--
-- Three rows equal a payroll line to the cent:
--   65464:27  Goodwill Multi-1  $2,300.00  Jose Dominquez, week of 2026-02-23 (payroll, GC)
--   65873:25  Goodwill Multi-1  $1,825.00  Jose Dominquez, week of 2026-03-16 (payroll, GC)
--   65464:3   115 Hillside Dr     $781.62  David Busico,   week of 2026-02-23 (payroll, drywall)
-- The app hides superseded rows from GC actuals (actualsHybridService, fetchLaborEntries).

ALTER TABLE public.labor_entries
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_reason text;

COMMENT ON COLUMN public.labor_entries.superseded_at IS
  'Set when the same wages are counted from payroll. Superseded rows are kept as history and excluded from actuals.';

UPDATE public.labor_entries
SET superseded_at = now(),
    superseded_reason = 'Same wages as payroll: Jose Dominquez, week of 2026-02-23 (GC)'
WHERE source_system = 'qbo' AND source_id = '65464:27' AND superseded_at IS NULL;

UPDATE public.labor_entries
SET superseded_at = now(),
    superseded_reason = 'Same wages as payroll: Jose Dominquez, week of 2026-03-16 (GC)'
WHERE source_system = 'qbo' AND source_id = '65873:25' AND superseded_at IS NULL;

UPDATE public.labor_entries
SET superseded_at = now(),
    superseded_reason = 'Same wages as payroll: David Busico, week of 2026-02-23 (drywall)'
WHERE source_system = 'qbo' AND source_id = '65464:3' AND superseded_at IS NULL;

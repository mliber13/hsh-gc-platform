BEGIN;

ALTER TABLE public.org_drywall_catalogs
  ADD COLUMN IF NOT EXISTS dashboard_targets jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.org_drywall_catalogs.dashboard_targets IS
  'Drywall KPI dashboard targets (annual revenue, backlog, capacity, manpower) — merged with app defaults on read.';

COMMIT;

BEGIN;

ALTER TABLE public.org_drywall_catalogs
  ADD COLUMN IF NOT EXISTS margin_floor_target numeric NOT NULL DEFAULT 0.30,
  ADD COLUMN IF NOT EXISTS po_estimated_cost_per_sqft numeric NOT NULL DEFAULT 2.50;

COMMENT ON COLUMN public.org_drywall_catalogs.margin_floor_target IS
  'D.4: Org-wide minimum acceptable margin (cost-vs-bid ratio). Below this triggers reason-required confirmation at quote send / PO field-measurement → order.';
COMMENT ON COLUMN public.org_drywall_catalogs.po_estimated_cost_per_sqft IS
  'D.4: Estimated all-in cost per sqft used to compute margin on PO projects at field measurement time (no quote math available).';

COMMIT;

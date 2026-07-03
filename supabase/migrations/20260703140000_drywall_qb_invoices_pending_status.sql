-- QB.1b — allow pending review status for unmatched / triage invoices

BEGIN;

ALTER TABLE public.drywall_qb_invoices
  DROP CONSTRAINT IF EXISTS drywall_qb_invoices_review_status_check;

ALTER TABLE public.drywall_qb_invoices
  ADD CONSTRAINT drywall_qb_invoices_review_status_check
  CHECK (review_status IN ('pending', 'accepted', 'rejected'));

COMMIT;

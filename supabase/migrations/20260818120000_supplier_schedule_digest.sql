-- ============================================================
-- Supplier delivery-schedule digest — data + change tracking
-- ============================================================
-- Feeds a weekday-morning "your upcoming deliveries" email to each supplier
-- (their corporate IT blocks our live share link). The digest only sends when
-- a supplier's schedule changed since the last one they received — the change
-- tracking table below stores a signature of what was last sent.
--
-- Unlike drywall_supplier_upcoming (which HIDES items once an order is sent),
-- this returns EVERY future-dated supplier-assigned schedule item, because the
-- supplier needs the delivery date whether or not a PO has gone out — and the
-- date is exactly the thing that keeps moving.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.drywall_supplier_delivery_schedule()
RETURNS TABLE (
  organization_id uuid,
  supplier_id uuid,
  supplier_name text,
  supplier_email text,
  project_id uuid,
  project_name text,
  item_id uuid,
  item_name text,
  stock_date text,
  quoted_sqft double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.organization_id,
    si.supplier_id,
    s.name,
    s.email,
    p.id,
    p.name,
    si.id,
    si.name,
    si.start_date::text,
    CASE WHEN (p.metadata->'legacy'->'quote'->>'sqft') ~ '^[0-9]+(\.[0-9]+)?$'
         THEN (p.metadata->'legacy'->'quote'->>'sqft')::double precision ELSE NULL END
  FROM public.schedule_items si
  JOIN public.projects p ON p.id = si.project_id
  JOIN public.suppliers s ON s.id = si.supplier_id
  WHERE si.supplier_id IS NOT NULL
    AND si.start_date >= current_date
    AND COALESCE(p.status, '') NOT IN ('closed', 'complete')
  ORDER BY s.name, si.start_date;
$$;

REVOKE ALL ON FUNCTION public.drywall_supplier_delivery_schedule() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.drywall_supplier_delivery_schedule() TO service_role;

-- One row per supplier: the signature of the schedule they last received, so the
-- cron can send only when it changed. Touched only by the edge function
-- (service role); RLS on with no policies denies everyone else.
CREATE TABLE IF NOT EXISTS public.supplier_schedule_digest_sends (
  supplier_id uuid PRIMARY KEY REFERENCES public.suppliers(id) ON DELETE CASCADE,
  organization_id uuid,
  last_signature text,
  last_sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_schedule_digest_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.supplier_schedule_digest_sends FROM PUBLIC;

COMMIT;

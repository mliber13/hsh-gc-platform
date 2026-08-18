-- ============================================================
-- Supplier delivery-schedule digest — add field-measured sqft
-- ============================================================
-- The digest email should show each project's sqft so the supplier can plan
-- load/quantity: prefer the field-measured total (metadata.legacy.fieldTakeoff
-- .totalMeasuredSqft) once measured, else fall back to the quoted sqft.
-- Adding a return column changes the function's result type, so DROP first.
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS public.drywall_supplier_delivery_schedule();

CREATE FUNCTION public.drywall_supplier_delivery_schedule()
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
  quoted_sqft double precision,
  measured_sqft double precision
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
         THEN (p.metadata->'legacy'->'quote'->>'sqft')::double precision ELSE NULL END,
    CASE WHEN (p.metadata->'legacy'->'fieldTakeoff'->>'totalMeasuredSqft') ~ '^[0-9]+(\.[0-9]+)?$'
         THEN (p.metadata->'legacy'->'fieldTakeoff'->>'totalMeasuredSqft')::double precision ELSE NULL END
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

COMMIT;

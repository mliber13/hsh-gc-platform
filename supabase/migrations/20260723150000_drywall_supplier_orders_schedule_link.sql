-- Supplier view P2b: resolve an order's delivery date from its linked stock schedule item.
-- Orders can carry scheduleItemId (the stock schedule item they deliver on). When linked, the
-- schedule item's start_date is the source of truth for the delivery date (so moving the stock
-- item on the schedule moves the board date). Falls back to the order's own deliveryDate.

CREATE OR REPLACE FUNCTION public.drywall_supplier_orders()
RETURNS TABLE (
  project_id uuid,
  project_name text,
  order_id text,
  order_number text,
  supplier_id text,
  supplier text,
  delivery_date text,
  status text,
  item_count int,
  updated_at text,
  schedule_item_id text,
  schedule_item_name text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.name,
    NULLIF(trim(o.elem->>'id'), ''),
    NULLIF(trim(o.elem->>'orderNumber'), ''),
    NULLIF(trim(o.elem->>'supplierId'), ''),
    NULLIF(trim(o.elem->>'supplier'), ''),
    COALESCE(si.start_date::text, NULLIF(trim(o.elem->>'deliveryDate'), '')),
    COALESCE(NULLIF(trim(o.elem->>'status'), ''), 'draft'),
    COALESCE(
      jsonb_array_length(
        CASE WHEN jsonb_typeof(o.elem->'items') = 'array' THEN o.elem->'items' ELSE '[]'::jsonb END
      ),
      0
    ),
    NULLIF(trim(o.elem->>'updatedAt'), ''),
    NULLIF(trim(o.elem->>'scheduleItemId'), ''),
    si.name
  FROM public.projects p
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(p.metadata->'legacy'->'orders') = 'array'
         THEN p.metadata->'legacy'->'orders'
         ELSE '[]'::jsonb END
  ) AS o(elem)
  LEFT JOIN public.schedule_items si
    ON si.id::text = NULLIF(trim(o.elem->>'scheduleItemId'), '');
$$;

REVOKE ALL ON FUNCTION public.drywall_supplier_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.drywall_supplier_orders() TO authenticated;

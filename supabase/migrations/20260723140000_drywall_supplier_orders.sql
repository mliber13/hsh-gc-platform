-- Supplier view P2: cross-project order board.
-- Extracts each material order from projects.metadata.legacy.orders[] server-side and returns
-- flat scalar rows — so the board never ships full project metadata (egress-safe, mirrors the
-- comms_unread_for_projects / drywall_list_stage_scalars pattern). SECURITY INVOKER: the
-- projects RLS policy scopes the scan to the caller's org automatically.

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
  updated_at text
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
    NULLIF(trim(o.elem->>'deliveryDate'), ''),
    COALESCE(NULLIF(trim(o.elem->>'status'), ''), 'draft'),
    COALESCE(
      jsonb_array_length(
        CASE WHEN jsonb_typeof(o.elem->'items') = 'array' THEN o.elem->'items' ELSE '[]'::jsonb END
      ),
      0
    ),
    NULLIF(trim(o.elem->>'updatedAt'), '')
  FROM public.projects p
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(p.metadata->'legacy'->'orders') = 'array'
         THEN p.metadata->'legacy'->'orders'
         ELSE '[]'::jsonb END
  ) AS o(elem);
$$;

REVOKE ALL ON FUNCTION public.drywall_supplier_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.drywall_supplier_orders() TO authenticated;

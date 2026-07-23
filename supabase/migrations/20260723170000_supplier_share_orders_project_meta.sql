-- Supplier share P3 fix: include the project's address + client so the supplier-facing order
-- PDF matches the Order-stage PDF (which prints project.address and project.client).
-- to_jsonb() normalizes text-or-object address/client into jsonb; the edge function formats it.
-- Adding return columns changes the function signature, so drop + recreate.

DROP FUNCTION IF EXISTS public.supplier_share_orders(text);

CREATE FUNCTION public.supplier_share_orders(p_token text)
RETURNS TABLE (
  supplier_name text,
  project_id uuid,
  project_name text,
  project_address jsonb,
  project_client jsonb,
  order_json jsonb,
  delivery_date text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supplier uuid;
  v_org uuid;
  v_supplier_name text;
BEGIN
  SELECT sl.supplier_id, sl.organization_id
    INTO v_supplier, v_org
  FROM public.supplier_share_links sl
  WHERE sl.token = p_token AND sl.revoked_at IS NULL
  LIMIT 1;

  IF v_supplier IS NULL THEN RETURN; END IF;

  SELECT s.name INTO v_supplier_name FROM public.suppliers s WHERE s.id = v_supplier;

  RETURN QUERY
  SELECT
    v_supplier_name,
    p.id,
    p.name,
    to_jsonb(p.address),
    to_jsonb(p.client),
    o.elem,
    COALESCE(si.start_date::text, NULLIF(trim(o.elem->>'deliveryDate'), ''))
  FROM public.projects p
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(p.metadata->'legacy'->'orders') = 'array'
         THEN p.metadata->'legacy'->'orders'
         ELSE '[]'::jsonb END
  ) AS o(elem)
  LEFT JOIN public.schedule_items si
    ON si.id::text = NULLIF(trim(o.elem->>'scheduleItemId'), '')
  WHERE p.organization_id = v_org
    AND o.elem->>'supplierId' = v_supplier::text
    AND COALESCE(o.elem->>'status', 'draft') IN ('sent', 'confirmed', 'partial');
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_share_orders(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_share_orders(text) TO service_role;

-- P0-DATA-1: supplier share writes only legacy.orders via jsonb_set,
-- instead of read-replacing the whole projects.metadata blob.

BEGIN;

CREATE OR REPLACE FUNCTION public.supplier_share_set_order_status(
  p_project_id uuid,
  p_order_id text,
  p_supplier_id uuid,
  p_status text,
  p_stamp_field text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metadata jsonb;
  v_order jsonb;
  v_current_status text;
  v_now text;
  v_new_orders jsonb;
BEGIN
  IF p_status = 'confirmed' THEN
    IF p_stamp_field IS DISTINCT FROM 'supplierConfirmedAt' THEN
      RAISE EXCEPTION 'invalid stamp field' USING ERRCODE = '22023';
    END IF;
  ELSIF p_status = 'complete' THEN
    IF p_stamp_field IS DISTINCT FROM 'supplierDeliveredAt' THEN
      RAISE EXCEPTION 'invalid stamp field' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid status' USING ERRCODE = '22023';
  END IF;

  SELECT p.metadata
    INTO v_metadata
  FROM public.projects p
  WHERE p.id = p_project_id
    AND p.organization_id = (
      SELECT s.organization_id FROM public.suppliers s WHERE s.id = p_supplier_id
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  IF jsonb_typeof(COALESCE(v_metadata, '{}'::jsonb)->'legacy'->'orders') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT elem
    INTO v_order
  FROM jsonb_array_elements(v_metadata->'legacy'->'orders') AS t(elem)
  WHERE elem->>'id' = p_order_id
  LIMIT 1;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(v_order->>'supplierId', '') IS DISTINCT FROM p_supplier_id::text THEN
    RAISE EXCEPTION 'Not authorized for this order' USING ERRCODE = '42501';
  END IF;

  v_current_status := COALESCE(v_order->>'status', 'draft');
  IF p_status = 'confirmed' THEN
    IF v_current_status IS DISTINCT FROM 'sent' THEN
      RAISE EXCEPTION 'This order is not awaiting confirmation.' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_current_status NOT IN ('confirmed', 'partial') THEN
      RAISE EXCEPTION 'This order is not ready to mark delivered.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_now := to_char(timezone('UTC', clock_timestamp()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  SELECT jsonb_agg(
    CASE
      WHEN elem->>'id' = p_order_id THEN
        elem || jsonb_build_object(
          'status', p_status,
          p_stamp_field, v_now,
          'updatedAt', v_now
        )
      ELSE elem
    END
    ORDER BY ord
  )
    INTO v_new_orders
  FROM jsonb_array_elements(v_metadata->'legacy'->'orders') WITH ORDINALITY AS t(elem, ord);

  UPDATE public.projects
     SET metadata = jsonb_set(
           COALESCE(v_metadata, '{}'::jsonb),
           '{legacy,orders}',
           v_new_orders,
           true
         ),
         updated_at = clock_timestamp()
   WHERE id = p_project_id;

  RETURN p_status;
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_share_set_order_status(uuid, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_share_set_order_status(uuid, text, uuid, text, text) TO service_role;

COMMIT;

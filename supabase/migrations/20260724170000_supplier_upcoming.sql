BEGIN;

-- Supplier "Upcoming (estimate)": supplier-assigned schedule items in the future that don't yet
-- have a real order (status sent/confirmed/partial/complete linked via scheduleItemId), with the
-- project's quoted sqft as a heads-up. Graduates to a real order once one is sent.

-- Office board (all suppliers, org-scoped via SECURITY INVOKER + projects RLS).
CREATE OR REPLACE FUNCTION public.drywall_supplier_upcoming()
RETURNS TABLE (
  supplier_id uuid,
  supplier_name text,
  project_id uuid,
  project_name text,
  item_id uuid,
  item_name text,
  stock_date text,
  quoted_sqft double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    si.supplier_id,
    s.name,
    p.id,
    p.name,
    si.id,
    si.name,
    si.start_date::text,
    CASE WHEN (p.metadata->'legacy'->'quote'->>'sqft') ~ '^[0-9]+(\.[0-9]+)?$'
         THEN (p.metadata->'legacy'->'quote'->>'sqft')::double precision ELSE NULL END
  FROM public.schedule_items si
  JOIN public.projects p ON p.id = si.project_id
  LEFT JOIN public.suppliers s ON s.id = si.supplier_id
  WHERE si.supplier_id IS NOT NULL
    AND si.start_date >= current_date
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p.metadata->'legacy'->'orders') = 'array'
             THEN p.metadata->'legacy'->'orders' ELSE '[]'::jsonb END
      ) AS o(elem)
      WHERE o.elem->>'scheduleItemId' = si.id::text
        AND COALESCE(o.elem->>'status', 'draft') IN ('sent', 'confirmed', 'partial', 'complete')
    )
  ORDER BY si.start_date;
$$;

REVOKE ALL ON FUNCTION public.drywall_supplier_upcoming() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.drywall_supplier_upcoming() TO authenticated;

-- Supplier share link (scoped to the token's supplier; SECURITY DEFINER, service_role only).
CREATE OR REPLACE FUNCTION public.supplier_share_upcoming(p_token text)
RETURNS TABLE (
  project_id uuid,
  project_name text,
  item_name text,
  stock_date text,
  quoted_sqft double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supplier uuid;
  v_org uuid;
BEGIN
  SELECT sl.supplier_id, sl.organization_id
    INTO v_supplier, v_org
  FROM public.supplier_share_links sl
  WHERE sl.token = p_token AND sl.revoked_at IS NULL
  LIMIT 1;

  IF v_supplier IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    si.name,
    si.start_date::text,
    CASE WHEN (p.metadata->'legacy'->'quote'->>'sqft') ~ '^[0-9]+(\.[0-9]+)?$'
         THEN (p.metadata->'legacy'->'quote'->>'sqft')::double precision ELSE NULL END
  FROM public.schedule_items si
  JOIN public.projects p ON p.id = si.project_id
  WHERE si.supplier_id = v_supplier
    AND p.organization_id = v_org
    AND si.start_date >= current_date
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p.metadata->'legacy'->'orders') = 'array'
             THEN p.metadata->'legacy'->'orders' ELSE '[]'::jsonb END
      ) AS o(elem)
      WHERE o.elem->>'scheduleItemId' = si.id::text
        AND COALESCE(o.elem->>'status', 'draft') IN ('sent', 'confirmed', 'partial', 'complete')
    )
  ORDER BY si.start_date;
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_share_upcoming(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_share_upcoming(text) TO service_role;

COMMIT;

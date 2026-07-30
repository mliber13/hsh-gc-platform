-- Extend drywall list RPC with financial scalars so PostgREST does not ship
-- large JSONB subtrees (lineItems, bidSnapshot payload, changeOrders) on every list load.
-- Prior regression: those blobs were re-added for KPI/CO and contributed to 57014 timeouts
-- under the authenticated role's 8s statement_timeout (esp. when paired with full-metadata selects).

DROP FUNCTION IF EXISTS public.drywall_list_stage_scalars(uuid[]);

CREATE OR REPLACE FUNCTION public.drywall_list_stage_scalars(project_ids uuid[])
RETURNS TABLE (
  id uuid,
  field_measured_sqft double precision,
  field_takeoff_updated text,
  field_first_measurement_id text,
  order_first_id text,
  quote_has_line_items boolean,
  quote_drywall_sqft double precision,
  drywall_scope_revenue double precision,
  accepted_change_order_revenue double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.id,
    NULLIF(trim(p.metadata->'legacy'->'fieldTakeoff'->>'totalMeasuredSqft'), '')::double precision,
    NULLIF(trim(p.metadata->'legacy'->'fieldTakeoff'->>'updatedAt'), ''),
    NULLIF(trim(p.metadata->'legacy'->'fieldTakeoff'->'measurements'->0->>'id'), ''),
    NULLIF(trim(p.metadata->'legacy'->'orders'->0->>'id'), ''),
    (
      jsonb_typeof(p.metadata->'legacy'->'quote'->'lineItems') = 'array'
      AND jsonb_array_length(p.metadata->'legacy'->'quote'->'lineItems') > 0
    ),
    (
      SELECT SUM(NULLIF(trim(li->>'quantity'), '')::double precision)
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(p.metadata->'legacy'->'quote'->'lineItems') = 'array'
            THEN p.metadata->'legacy'->'quote'->'lineItems'
          ELSE '[]'::jsonb
        END
      ) li
      WHERE li->>'type' = 'drywall'
    ),
    (
      SELECT CASE
        WHEN x.routine_subtotal > 0 AND x.bid_total > 0 AND x.drywall_direct > 0
          THEN x.bid_total * LEAST(1.0, x.drywall_direct / x.routine_subtotal)
        ELSE NULL
      END
      FROM (
        SELECT
          NULLIF(trim(payload->>'routineSubtotal'), '')::double precision AS routine_subtotal,
          NULLIF(trim(payload->>'bidTotal'), '')::double precision AS bid_total,
          (
            SELECT COALESCE(SUM(NULLIF(trim(li->>'computed_line_total'), '')::double precision), 0)
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(payload->'lineItems') = 'array' THEN payload->'lineItems'
                ELSE '[]'::jsonb
              END
            ) li
            WHERE li->>'type' = 'drywall'
          ) AS drywall_direct
        FROM (
          SELECT p.metadata->'legacy'->'quote'->'bidSnapshot'->'payload' AS payload
        ) s
      ) x
    ),
    (
      SELECT COALESCE(SUM(
        CASE
          WHEN lower(coalesce(co->>'status', '')) IN ('accepted', 'approved') THEN
            COALESCE(
              NULLIF(regexp_replace(coalesce(co->>'acceptedAmount', ''), '[^0-9.-]', '', 'g'), '')::double precision,
              CASE
                WHEN lower(coalesce(co->>'status', '')) = 'approved' THEN
                  NULLIF(regexp_replace(coalesce(co->>'requestedAmount', ''), '[^0-9.-]', '', 'g'), '')::double precision
                ELSE NULL
              END,
              0
            )
          ELSE 0
        END
      ), 0)
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(p.metadata->'legacy'->'changeOrders') = 'array'
            THEN p.metadata->'legacy'->'changeOrders'
          ELSE '[]'::jsonb
        END
      ) co
    )
  FROM public.projects p
  WHERE p.id = ANY(project_ids);
$$;

REVOKE ALL ON FUNCTION public.drywall_list_stage_scalars(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.drywall_list_stage_scalars(uuid[]) TO authenticated;

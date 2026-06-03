-- Scalar stage signals for /drywall list cards (field + order).
-- PostgREST JSON paths on metadata->legacy->fieldTakeoff (camelCase) are unreliable in .select();
-- this RPC returns only small text/number fields per project id.

CREATE OR REPLACE FUNCTION public.drywall_list_stage_scalars(project_ids uuid[])
RETURNS TABLE (
  id uuid,
  field_measured_sqft double precision,
  field_takeoff_updated text,
  field_first_measurement_id text,
  order_first_id text
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
    NULLIF(trim(p.metadata->'legacy'->'orders'->0->>'id'), '')
  FROM public.projects p
  WHERE p.id = ANY(project_ids);
$$;

REVOKE ALL ON FUNCTION public.drywall_list_stage_scalars(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.drywall_list_stage_scalars(uuid[]) TO authenticated;

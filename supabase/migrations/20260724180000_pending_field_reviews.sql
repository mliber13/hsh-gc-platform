-- Field-review notification: projects whose field takeoff was submitted for office review.
-- Returns scalars only (id, name, submitted-at, measured sqft) — never ships metadata.
-- SECURITY INVOKER: projects RLS scopes to the caller's org.

CREATE OR REPLACE FUNCTION public.drywall_pending_field_reviews()
RETURNS TABLE (
  project_id uuid,
  project_name text,
  submitted_at text,
  measured_sqft double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.name,
    NULLIF(trim(p.metadata->'legacy'->'fieldTakeoff'->>'submittedForReviewAt'), ''),
    CASE WHEN (p.metadata->'legacy'->'fieldTakeoff'->>'totalMeasuredSqft') ~ '^[0-9]+(\.[0-9]+)?$'
         THEN (p.metadata->'legacy'->'fieldTakeoff'->>'totalMeasuredSqft')::double precision
         ELSE NULL END
  FROM public.projects p
  WHERE p.metadata->'legacy'->'fieldTakeoff'->>'reviewStatus' = 'pending_review'
  ORDER BY p.metadata->'legacy'->'fieldTakeoff'->>'submittedForReviewAt' NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.drywall_pending_field_reviews() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.drywall_pending_field_reviews() TO authenticated;

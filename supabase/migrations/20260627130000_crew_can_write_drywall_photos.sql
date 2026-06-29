-- D.6.8 Phase 5 — crew write access to drywall-field-photos bucket.
-- Same org-scoped pattern as read migration (20260626120000); V1 grants crew write on all org photos.

BEGIN;

CREATE OR REPLACE FUNCTION public.user_can_access_drywall_photos(
  p_org_id_text text,
  p_for_write boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.organization_id::text = p_org_id_text
      AND (
        CASE
          WHEN p_for_write THEN
            p.roles && ARRAY['owner', 'office_gc', 'office_drywall', 'crew']::text[]
          ELSE
            p.roles && ARRAY['owner', 'office_gc', 'office_drywall', 'viewer', 'crew']::text[]
        END
      )
  );
$$;

COMMIT;

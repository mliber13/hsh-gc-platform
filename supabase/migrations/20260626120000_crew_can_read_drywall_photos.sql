-- D.6 follow-up — crew users need read access to drywall-field-photos so they can
-- see site photos uploaded during field measurement (D.6.2+).
--
-- Note: this grants read on ALL drywall photos within their organization. A tighter
-- scope (only photos for projects they're assigned to via schedule_items.assigned_persons)
-- is desirable but adds a more expensive predicate to a hot storage path. Keep it simple
-- for V1; revisit if cross-project photo leakage becomes a concern.

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
            p.roles && ARRAY['owner', 'office_gc', 'office_drywall']::text[]
          ELSE
            p.roles && ARRAY['owner', 'office_gc', 'office_drywall', 'viewer', 'crew']::text[]
        END
      )
  );
$$;

COMMIT;

BEGIN;

CREATE OR REPLACE FUNCTION public.user_can_read_drywall_catalogs(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_rbac_role(
    ARRAY['owner', 'office_gc', 'office_drywall', 'viewer', 'crew']::text[],
    uid
  );
$$;

COMMIT;

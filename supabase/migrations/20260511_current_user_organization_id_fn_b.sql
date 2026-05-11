-- Helper for org-scoped RLS. Step 5 used the inline fallback because
-- this function didn't exist; landing it now so steps 6-14 can use
-- current_user_organization_id() directly in their policies.
-- Reference: SUPABASE_SPINE.md (drywall) describes this helper as the
-- canonical pattern.

CREATE OR REPLACE FUNCTION public.current_user_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.current_user_organization_id() TO authenticated;

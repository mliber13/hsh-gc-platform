-- Operator-only lookup: is this org_team person linked to a field-foreman profile?
-- Needed because profiles RLS is self-read only — client cannot read another user's flag.
-- Do NOT apply to prod until reviewed.

CREATE OR REPLACE FUNCTION public.person_is_field_foreman(p_person_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT public.user_can_edit() THEN false
    WHEN p_person_id IS NULL OR trim(p_person_id) = '' THEN false
    ELSE COALESCE(
      (
        SELECT p.is_field_foreman
        FROM public.profiles p
        WHERE p.organization_id = public.get_user_organization_uuid()
          AND COALESCE(p.is_active, true)
          AND (
            p.linked_employee_id = p_person_id
            OR p.linked_contractor_id = p_person_id
          )
        LIMIT 1
      ),
      false
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.person_is_field_foreman(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.person_is_field_foreman(text) TO authenticated;

COMMENT ON FUNCTION public.person_is_field_foreman(text) IS
  'Operator-only: true when an active org profile linked to p_person_id has is_field_foreman. Non-operators always get false.';

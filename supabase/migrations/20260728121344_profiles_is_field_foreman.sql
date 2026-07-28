-- Field Foreman capability flag (crew-expansion): profiles.is_field_foreman
-- Jeremy stays roles = ['crew']; flag expands /crew visibility + schedule writes.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_field_foreman boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_field_foreman IS
  'Crew-expansion flag: when true with roles containing crew, /crew sees all drywall projects, full materials, schedule adjust, and all-project comms. Not an operator role.';

CREATE OR REPLACE FUNCTION public.user_is_field_foreman(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT p.is_field_foreman
      FROM public.profiles p
      WHERE p.id = uid
        AND COALESCE(p.is_active, true)
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.user_is_field_foreman(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_field_foreman(uuid) TO authenticated;

-- Launch: Jeremy Moore (crew + Field Measurer)
UPDATE public.profiles
SET is_field_foreman = true,
    updated_at = NOW()
WHERE id = 'd2e4d2e2-8cab-425f-b04b-534e535c268b'
   OR lower(email) = 'tempestjm@gmail.com';

-- Foreman may post/read comms on any org drywall project (still crew role).
CREATE OR REPLACE FUNCTION public.crew_can_post_comms(
  p_project_id uuid,
  uid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.user_has_crew_role(uid)
    AND (
      public.user_is_field_foreman(uid)
      OR EXISTS (
        SELECT 1
        FROM public.schedule_items si
        JOIN public.profiles p ON p.id = uid
        WHERE si.project_id = p_project_id
          AND si.organization_id = p.organization_id
          AND COALESCE(p.linked_employee_id, p.linked_contractor_id, '') <> ''
          AND COALESCE(p.linked_employee_id, p.linked_contractor_id) = ANY(si.assigned_persons)
      )
    );
$$;

COMMIT;

-- Batch name resolver so the per-project comms panels can show real author names
-- (not email) the same way the messages inbox does. Reuses display_name_for_user.

CREATE OR REPLACE FUNCTION public.display_names_for_users(p_uids uuid[])
RETURNS TABLE(user_id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u, public.display_name_for_user(u)
  FROM unnest(COALESCE(p_uids, ARRAY[]::uuid[])) AS u;
$$;

REVOKE ALL ON FUNCTION public.display_names_for_users(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.display_names_for_users(uuid[]) TO authenticated;

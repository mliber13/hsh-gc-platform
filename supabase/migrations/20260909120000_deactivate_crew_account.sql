-- Make deactivating a crew account actually stop them, and give the office a
-- way to do it.
--
-- `profiles.is_active` already gates the org-scoped SELECT policies, so an
-- inactive user sees empty screens. But every crew WRITE goes through a
-- SECURITY DEFINER RPC, and none of them checked it: a deactivated crew member
-- could still clock in, post messages, upload photos and update task progress.
-- That is P1-SEC-7 in docs/V1_HARDENING_PLAN_2026-09.md.
--
-- Rather than edit fifteen RPCs, the check goes on the two helpers they all
-- funnel through. Verified safe by inspection before doing so: every single use
-- of both is fail-closed — either `IF NOT ... THEN RAISE`, or a positive
-- conjunction in a policy. Neither is ever negated in a way where returning
-- false or NULL would GRANT access, so an inactive user can only ever be denied.
--
-- Payroll history is deliberately untouched. Deactivation is about the login,
-- not the person: pay periods reference the org_team member id, so removing the
-- roster entry would orphan their history. Offboarding = deactivate the account,
-- leave the team member, optionally archive them in HR.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Gate the two shared crew helpers on active status
-- ---------------------------------------------------------------------------

-- Every crew and foreman RPC opens with this. Now it means "is an ACTIVE crew
-- member" — which is the question each caller is actually asking, since all of
-- them use it as a permission gate rather than for information.
CREATE OR REPLACE FUNCTION public.user_has_crew_role(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE('crew' = ANY(p.roles), false)
     AND COALESCE(p.is_active, true)
  FROM public.profiles p
  WHERE p.id = uid
  LIMIT 1;
$$;

-- Identity for the crew message lanes and the time clock. NULL for an inactive
-- account, so the lane predicate (audience_person_id = <id>) stops matching.
CREATE OR REPLACE FUNCTION public.crew_person_id_for_user(uid uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
           WHEN COALESCE(p.is_active, true)
             THEN COALESCE(p.linked_employee_id, p.linked_contractor_id)
           ELSE NULL
         END
  FROM public.profiles p
  WHERE p.id = uid
  LIMIT 1;
$$;

-- While here: pin search_path on is_user_active, which both of the above now
-- depend on and which runs inside most RLS policies (P1-SEC-1). Body unchanged —
-- a missing profile row still reads as active, which invite-first users rely on.
CREATE OR REPLACE FUNCTION public.is_user_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.is_active FROM public.profiles p WHERE p.id = auth.uid()),
    true
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Let the office flip it
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_crew_account_active(
  p_user_id uuid,
  p_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_target_org uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_org := public.get_user_organization_uuid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organization';
  END IF;

  IF NOT (public.user_is_rbac_owner() OR public.user_is_admin()) THEN
    RAISE EXCEPTION 'not authorized to change account status';
  END IF;

  -- Locking yourself out is never the intent.
  IF p_user_id = v_uid THEN
    RAISE EXCEPTION 'you cannot change your own account status';
  END IF;

  SELECT p.organization_id INTO v_target_org
    FROM public.profiles p
   WHERE p.id = p_user_id;

  IF v_target_org IS NULL OR v_target_org <> v_org THEN
    RAISE EXCEPTION 'account not found';
  END IF;

  UPDATE public.profiles
     SET is_active = p_active,
         updated_at = now()
   WHERE id = p_user_id
     AND organization_id = v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.set_crew_account_active(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_crew_account_active(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.set_crew_account_active(uuid, boolean) IS
  'Office-only: activate or deactivate an account in the caller''s org. Deactivation '
  'blocks every crew RPC via user_has_crew_role and empties the org-scoped reads via '
  'is_user_active. Does not touch org_team, so payroll history survives.';

COMMIT;

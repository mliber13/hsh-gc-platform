-- Crew signup has been broken since 2026-09-10. This fixes it.
--
-- Batch 1A added a guard to consume_crew_invite_token (P1-SEC-3) so that an
-- existing office user clicking a crew invite link would be refused instead of
-- silently demoted to roles=['crew'] and losing the app. The intent was right.
-- The predicate was not:
--
--   AND EXISTS (SELECT 1 FROM unnest(p.roles) r WHERE r <> 'crew')
--
-- "any role that is not crew" also matches the DEFAULT. profiles.roles is
-- `text[] NOT NULL DEFAULT ARRAY['viewer']` (20260527000002:5), and
-- handle_new_user inserts a profile without naming roles — so every brand-new
-- account arrives holding {viewer}, trips the guard, and the signup fails with
-- "this account already has app access; ask the office to link it instead".
--
-- Not some signups. Every one, for four days. The 1A brief told the operator to
-- verify crew signup end to end and it never got run, which is exactly the check
-- that would have caught it.
--
-- The fix is to name what "already has app access" actually means rather than
-- infer it from the absence of 'crew'. A fresh signup holds {viewer} with no
-- organization; a real operator holds one of the roles below. Testing for those
-- explicitly cannot be tripped by a default.
--
-- 'viewer' is deliberately NOT in the list: it is the default every new account
-- gets, so it cannot distinguish a provisioned viewer from a signup two seconds
-- old. Linking a stray viewer to a crew member is a far smaller harm than
-- blocking every crew member from onboarding, which is what we have now.

BEGIN;

CREATE OR REPLACE FUNCTION public.consume_crew_invite_token(
  p_token text,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.crew_invite_tokens%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id is required';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'not authorized to consume invite for this user';
  END IF;

  -- Refuse to demote an account that really does have the operator app. Matches
  -- on the operator roles by name; see the header for why 'viewer' is excluded.
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.roles && ARRAY['owner','office_gc','office_drywall','field_gc','field_drywall']::text[]
  ) THEN
    RAISE EXCEPTION 'this account already has app access; ask the office to link it instead';
  END IF;

  SELECT * INTO v_invite
  FROM public.crew_invite_tokens
  WHERE token = p_token
    AND consumed_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite token is invalid, expired, or already used';
  END IF;

  IF v_invite.invited_email IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = p_user_id
        AND lower(trim(p.email)) = lower(trim(v_invite.invited_email))
    ) THEN
      RAISE EXCEPTION 'signup email does not match invite';
    END IF;
  END IF;

  UPDATE public.crew_invite_tokens
  SET consumed_at = now(),
      consumed_by = p_user_id
  WHERE id = v_invite.id;

  UPDATE public.profiles
  SET
    organization_id = v_invite.organization_id,
    role = 'viewer',
    roles = ARRAY['crew']::text[],
    linked_employee_id = v_invite.linked_employee_id,
    linked_contractor_id = v_invite.linked_contractor_id,
    hr_person_id = COALESCE(v_invite.linked_employee_id, v_invite.linked_contractor_id),
    hr_person_type = CASE
      WHEN v_invite.linked_employee_id IS NOT NULL THEN 'w2'
      WHEN v_invite.linked_contractor_id IS NOT NULL THEN '1099'
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.consume_crew_invite_token(text, uuid) IS
  'Links a signing-up crew account to its org_team member. Refuses an account that '
  'already holds an operator role, so a crew invite cannot demote an office user. '
  'Must test operator roles BY NAME -- "any role other than crew" also matches the '
  'profiles.roles default of {viewer} and blocked every new signup for four days '
  'in September 2026.';

COMMIT;

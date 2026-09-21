-- Name a crew account when the invite links it, not just in the schedule feed.
--
-- 20260921120000 stopped handle_new_user writing the email into full_name, so a
-- new crew account now arrives with no name at all. The schedule change-log
-- trigger copes -- 20260728162535 falls back to the org_team roster -- but
-- nothing else does. Comms authorship, the contact directory and the /crew
-- greeting all render `full_name || email` at the call site and would show the
-- address forever.
--
-- The invite already knows exactly who this person is: it carries the
-- organization and the linked_employee_id / linked_contractor_id, which is the
-- same pair the roster lookup needs. So name them here, once, at the moment the
-- link is made, rather than making every display site learn to resolve a roster.
--
-- Only fills a placeholder. A full_name that is absent, blank, or an email
-- address is not a name; anything else was typed by a person and is left alone.
-- That matters because signup CAN supply a name (Signup.tsx does, CrewSignupPage
-- does not) and an invite must not overwrite it.
--
-- Body otherwise byte-identical to 20260914130000_fix_crew_invite_blocks_new_signups.sql;
-- the operator-role guard there is load-bearing and unchanged.

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
  v_link text;
  v_roster_name text;
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

  -- The roster name for the member this invite links to. Same resolution the
  -- schedule change-log trigger uses (20260728162535).
  v_link := NULLIF(trim(COALESCE(v_invite.linked_employee_id, v_invite.linked_contractor_id)), '');

  IF v_link IS NOT NULL THEN
    SELECT NULLIF(trim(elem->>'name'), '')
    INTO v_roster_name
    FROM public.org_team ot,
         LATERAL (
           SELECT e AS elem
           FROM jsonb_array_elements(COALESCE(ot.payload->'employees', '[]'::jsonb)) AS e
           UNION ALL
           SELECT c AS elem
           FROM jsonb_array_elements(COALESCE(ot.payload->'contractors1099', '[]'::jsonb)) AS c
         ) roster
    WHERE ot.organization_id = v_invite.organization_id
      AND elem->>'id' = v_link
    LIMIT 1;
  END IF;

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
    -- Only when there is no real name to lose. An email is not a name.
    full_name = CASE
      WHEN v_roster_name IS NOT NULL
       AND (full_name IS NULL OR trim(full_name) = '' OR full_name LIKE '%@%')
      THEN v_roster_name
      ELSE full_name
    END,
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.consume_crew_invite_token(text, uuid) IS
  'Links a signing-up crew account to its org_team member, and names it from the '
  'roster when it has no real name of its own -- crew signup collects no name, so '
  'without this every display falls back to showing the email address. Refuses an '
  'account that already holds an operator role, so a crew invite cannot demote an '
  'office user. Must test operator roles BY NAME -- "any role other than crew" also '
  'matches the profiles.roles default of {viewer} and blocked every new signup for '
  'four days in September 2026.';

COMMIT;

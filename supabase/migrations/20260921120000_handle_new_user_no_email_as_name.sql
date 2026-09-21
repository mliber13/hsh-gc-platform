-- Stop new accounts being born with their email address as their display name.
--
-- handle_new_user has defaulted full_name to NEW.email since
-- 008_fix_user_profile_creation.sql, and every migration since has carried the
-- line forward untouched. CrewSignupPage passes no full_name, so every crew
-- account arrives with full_name literally equal to its email. Everything that
-- renders `full_name || email` then shows the email — the schedule activity
-- feed, comms authorship, the contact directory, the /crew greeting.
--
-- Worse, it is silent: the fallbacks downstream are all written as
-- `full_name || email`, so a full_name that *is* the email looks exactly like a
-- working fallback. 20260728162535 added org_team roster resolution to the
-- schedule change-log trigger for precisely this problem and it has never once
-- fired, because its roster branch only runs when full_name is empty — which,
-- with this default in place, never happens.
--
-- NULL is the honest value. The downstream `|| email` fallbacks render the same
-- thing they render today, and the roster branch that already exists can do its
-- job. Existing rows are repaired separately by
-- scripts/fix-profile-display-names.mjs.
--
-- Body otherwise byte-identical to 20260910120000_profiles_privilege_guard.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, organization_id, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULL,         -- uuid NULL = invite-first user; admin assigns org via invite flow
    'viewer',
    true
  );
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates the profile row for a new auth user. full_name is left NULL when signup '
  'supplies no name — never defaulted to the email, which made every downstream '
  '`full_name || email` fallback look satisfied while showing an address.';

COMMIT;

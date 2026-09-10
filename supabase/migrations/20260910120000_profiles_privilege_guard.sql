-- Batch 1A — close the profiles privilege-escalation path, and three smaller
-- holes in the same neighbourhood. See docs/briefs/BATCH_1A_PRIVILEGE_AND_AUTH.md.
--
-- The hole: "Users can update own profile" (20260425_a5c2_pilot.sql:81) is
-- `auth.uid() = id AND is_user_active()` with no column restriction, no
-- column-level REVOKE and no trigger. roles[] is only CHECK-constrained to
-- allowed *values*. So any authenticated user — a crew invite was enough —
-- could PATCH their own row via PostgREST and set roles='{owner}',
-- can_run_payroll, is_field_foreman, or point linked_employee_id at somebody
-- else and read their pay.
--
-- Four items in this file:
--   1. a BEFORE UPDATE column guard on profiles                     (P0-SEC-1)
--   2. search_path on the core definer helpers, + is_active in
--      user_can_edit                                                (P1-SEC-1)
--   3. a crew invite link no longer demotes an existing operator     (P1-SEC-3)
--   4. an empty-string linked_employee_id no longer shadows a
--      linked contractor in the clock RPCs                  (P1-SEC-7 remainder)

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. P0-SEC-1 — column guard on profiles self-update
-- ---------------------------------------------------------------------------

-- This function is deliberately SECURITY INVOKER, and that is load-bearing.
--
-- The exemption below keys off current_user: a write arriving straight from
-- PostgREST runs as `authenticated`, while a write from inside a SECURITY
-- DEFINER function runs as that function's owner (postgres). Under SECURITY
-- DEFINER the trigger function would itself change current_user to postgres,
-- the exemption would match every time, and the guard would be a silent no-op.
-- Verified on this database: as role `authenticated`, current_user reads
-- `authenticated` directly and inside a SECURITY INVOKER function, but
-- `postgres` inside a SECURITY DEFINER function and inside an INVOKER function
-- called from one.
--
-- The exemption is what keeps crew signup working. consume_crew_invite_token
-- sets a brand-new crew account's roles and linked_*, and that user is not an
-- owner — a guard without the exemption would refuse the very write that makes
-- the account usable. The same applies to set_crew_account_active. Both do
-- their own authorization (token validation; owner-or-admin), so they pass.
CREATE OR REPLACE FUNCTION public.guard_profiles_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
BEGIN
  -- Not a direct client write: a SECURITY DEFINER function or the service role.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF public.user_is_rbac_owner() OR public.user_is_admin() THEN
    RETURN NEW;
  END IF;

  -- organization_id_uuid is not in this list because it does not exist on this
  -- table; organization_id is already the uuid column, post type-conversion.
  -- The qb_* token columns are deliberately absent too: quickbooksService.ts
  -- writes them from the client on every QuickBooks connect and disconnect.
  IF NEW.role                    IS DISTINCT FROM OLD.role
     OR NEW.roles                IS DISTINCT FROM OLD.roles
     OR NEW.organization_id      IS DISTINCT FROM OLD.organization_id
     OR NEW.can_run_payroll      IS DISTINCT FROM OLD.can_run_payroll
     OR NEW.can_admin_qb         IS DISTINCT FROM OLD.can_admin_qb
     OR NEW.is_meeting_operator  IS DISTINCT FROM OLD.is_meeting_operator
     OR NEW.is_field_foreman     IS DISTINCT FROM OLD.is_field_foreman
     OR NEW.is_active            IS DISTINCT FROM OLD.is_active
     OR NEW.linked_employee_id   IS DISTINCT FROM OLD.linked_employee_id
     OR NEW.linked_contractor_id IS DISTINCT FROM OLD.linked_contractor_id
     OR NEW.hr_person_id         IS DISTINCT FROM OLD.hr_person_id
     OR NEW.hr_person_type       IS DISTINCT FROM OLD.hr_person_type
  THEN
    RAISE EXCEPTION 'not authorized to change account permissions';
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.guard_profiles_privileged_columns() IS
  'Refuses a change to any privilege-bearing profiles column unless the caller is '
  'an rbac owner or a legacy admin. Must stay SECURITY INVOKER: the exemption for '
  'trusted SECURITY DEFINER callers reads current_user, which SECURITY DEFINER on '
  'this function would pin to its own owner and disable the guard entirely.';

DROP TRIGGER IF EXISTS guard_profiles_privileged_columns ON public.profiles;
CREATE TRIGGER guard_profiles_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_privileged_columns();

-- ---------------------------------------------------------------------------
-- 2. P1-SEC-1 — search_path on the core definer helpers
-- ---------------------------------------------------------------------------
--
-- These run inside most RLS policies and none of them pinned search_path.
-- Bodies are otherwise unchanged, using the scalar-subquery form from
-- 008_fix_user_profile_creation.sql and adding the STABLE that was missing.
-- is_user_active and get_user_organization_uuid already carry search_path
-- (20260909120000) and are left alone. There is no get_user_organization on
-- this database — the uuid variant is the only one.

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE(
    (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()),
    'viewer'
  );
$fn$;

CREATE OR REPLACE FUNCTION public.user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE(
    (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()),
    'viewer'
  ) = 'admin';
$fn$;

-- One behaviour change: user_can_edit now also requires an active account.
-- Today a deactivated admin still passes every write policy in the app. Safe
-- by inspection, same reasoning as the crew helper in 20260909120000: every use
-- is fail-closed. In RLS it appears only as a positive conjunct, so false can
-- only deny. The two negated uses are both in functions and both deny —
-- person_is_field_foreman returns false, and record_project_comms_entry raises
-- unless the caller is instead allowed as crew.
CREATE OR REPLACE FUNCTION public.user_can_edit()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE(
    (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()),
    'viewer'
  ) IN ('admin', 'editor')
  AND public.is_user_active();
$fn$;

-- search_path only, bodies byte-identical to what is live.
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
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NULL,         -- uuid NULL = invite-first user; admin assigns org via invite flow
    'viewer',
    true
  );
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_form_completion_percentage(form_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  total_fields INTEGER;
  completed_fields INTEGER;
  form_data JSONB;
BEGIN
  -- Get form data
  SELECT pf.form_data INTO form_data
  FROM project_forms pf
  WHERE pf.id = form_id;

  -- This is a simplified calculation - in practice you'd count actual fields
  -- For now, return 0 if no data, 100 if has data
  IF form_data IS NULL OR form_data = '{}'::jsonb THEN
    RETURN 0;
  ELSE
    RETURN 100;
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.is_form_fully_signed_off(form_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  sign_offs JSONB;
  required_sign_offs JSONB;
  sign_off_key TEXT;
  sign_off_data JSONB;
BEGIN
  -- Get sign-offs and required sign-offs from form schema
  SELECT pf.sign_offs, pf.form_schema->'sign_offs'
  INTO sign_offs, required_sign_offs
  FROM project_forms pf
  WHERE pf.id = form_id;

  -- Check if all required sign-offs are present
  IF required_sign_offs IS NULL THEN
    RETURN true; -- No sign-offs required
  END IF;

  -- Loop through required sign-offs
  FOR sign_off_key IN SELECT jsonb_object_keys(required_sign_offs)
  LOOP
    sign_off_data := sign_offs->sign_off_key;

    -- Check if this sign-off exists and has required fields
    IF sign_off_data IS NULL OR
       sign_off_data->>'name' IS NULL OR
       sign_off_data->>'signature' IS NULL THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. P1-SEC-3 — an invite link must not demote an existing operator
-- ---------------------------------------------------------------------------
--
-- The function overwrites the caller's roles with ['crew']. If an existing
-- office user opened a crew invite link, their account became a crew account
-- and they lost the app. A fresh signup has roles empty or NULL, so the normal
-- path is untouched. Rest of the function is byte-identical.

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

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.roles IS NOT NULL
      AND EXISTS (SELECT 1 FROM unnest(p.roles) r WHERE r <> 'crew')
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

-- ---------------------------------------------------------------------------
-- 4. P1-SEC-7 remainder — an empty string shadows the contractor id
-- ---------------------------------------------------------------------------
--
-- linked_employee_id = '' is not NULL, so COALESCE returned the empty string
-- and a linked contractor was treated as unlinked ("crew account not linked to
-- a team member"). crewWorkspaceService.ts:141 already works around this on the
-- client. Signatures unchanged, so the existing grants survive.

CREATE OR REPLACE FUNCTION public.crew_clock_in(p_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_person text;
  v_person_type text;
  v_person_name text;
  v_project_name text;
  v_entry_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  v_org := public.get_user_organization_uuid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organization';
  END IF;
  IF NOT public.user_has_crew_role(v_uid) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT
    COALESCE(NULLIF(p.linked_employee_id, ''), NULLIF(p.linked_contractor_id, '')),
    CASE
      WHEN p.linked_employee_id IS NOT NULL AND p.linked_employee_id <> '' THEN 'w2'
      ELSE '1099'
    END
  INTO v_person, v_person_type
  FROM public.profiles p
  WHERE p.id = v_uid;
  IF v_person IS NULL OR v_person = '' THEN
    RAISE EXCEPTION 'crew account not linked to a team member';
  END IF;

  -- Must be assigned to a schedule item on this project.
  IF NOT EXISTS (
    SELECT 1 FROM public.schedule_items si
    WHERE si.project_id = p_project_id
      AND si.organization_id = v_org
      AND v_person = ANY(si.assigned_persons)
  ) THEN
    RAISE EXCEPTION 'not assigned to this job';
  END IF;

  -- One open punch per person.
  IF EXISTS (
    SELECT 1 FROM public.time_entries te
    WHERE te.organization_id = v_org
      AND te.person_id = v_person
      AND te.clock_out IS NULL
  ) THEN
    RAISE EXCEPTION 'already clocked in';
  END IF;

  v_person_name := COALESCE(
    (SELECT elem->>'name' FROM public.org_team ot, jsonb_array_elements(ot.payload->'employees') elem
       WHERE ot.organization_id = v_org AND elem->>'id' = v_person LIMIT 1),
    (SELECT elem->>'name' FROM public.org_team ot, jsonb_array_elements(ot.payload->'contractors1099') elem
       WHERE ot.organization_id = v_org AND elem->>'id' = v_person LIMIT 1)
  );
  SELECT name INTO v_project_name FROM public.projects WHERE id = p_project_id;

  INSERT INTO public.time_entries
    (organization_id, person_id, person_type, person_name, project_id, project_name,
     clock_in, clock_out, source_app, created_by, updated_at)
  VALUES
    (v_org, v_person, v_person_type, v_person_name, p_project_id, v_project_name,
     now(), NULL, 'GC', v_uid, now())
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crew_clock_out(p_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_person text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  v_org := public.get_user_organization_uuid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organization';
  END IF;
  IF NOT public.user_has_crew_role(v_uid) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(NULLIF(p.linked_employee_id, ''), NULLIF(p.linked_contractor_id, ''))
    INTO v_person
    FROM public.profiles p
    WHERE p.id = v_uid;
  IF v_person IS NULL OR v_person = '' THEN
    RAISE EXCEPTION 'crew account not linked to a team member';
  END IF;

  UPDATE public.time_entries
    SET clock_out = now(), updated_at = now()
    WHERE id = p_entry_id
      AND organization_id = v_org
      AND person_id = v_person
      AND clock_out IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no open punch to clock out';
  END IF;
END;
$$;

COMMIT;

-- HR port Phase A: profiles HR columns + can_run_payroll + RLS on org_team, pay_periods, time_entries
-- Source: docs/HR_PORT_PLAN.md Sections 4, 7, 9

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Profile columns (additive)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_run_payroll boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hr_person_id text NULL,
  ADD COLUMN IF NOT EXISTS hr_person_type text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_hr_person_type_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_hr_person_type_check
      CHECK (hr_person_type IS NULL OR hr_person_type IN ('w2', '1099'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Backfill can_run_payroll (Mark only; owner also passes via helper)
-- ---------------------------------------------------------------------------
UPDATE public.profiles
SET can_run_payroll = false,
    updated_at = NOW()
WHERE can_run_payroll IS DISTINCT FROM false;

UPDATE public.profiles
SET can_run_payroll = true,
    updated_at = NOW()
WHERE lower(email) = 'mark@hshdrywall.com';

-- ---------------------------------------------------------------------------
-- 3) HR RBAC helper functions (SECURITY DEFINER, auth.uid() / optional uid arg)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_is_rbac_owner(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT 'owner' = ANY(p.roles)
      FROM public.profiles p
      WHERE p.id = uid
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.user_effective_rbac_roles(uid uuid DEFAULT auth.uid())
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.roles FROM public.profiles p WHERE p.id = uid),
    ARRAY['viewer']::text[]
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_rbac_role(required text[], uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_is_rbac_owner(uid)
    OR COALESCE(
      (
        SELECT p.roles && required
        FROM public.profiles p
        WHERE p.id = uid
      ),
      false
    );
$$;

CREATE OR REPLACE FUNCTION public.user_can_run_payroll(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_is_rbac_owner(uid)
    OR COALESCE(
      (
        SELECT p.can_run_payroll
        FROM public.profiles p
        WHERE p.id = uid
          AND COALESCE(p.is_active, true)
      ),
      false
    );
$$;

CREATE OR REPLACE FUNCTION public.user_hr_person_id(uid uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.hr_person_id FROM public.profiles p WHERE p.id = uid;
$$;

CREATE OR REPLACE FUNCTION public.user_hr_person_type(uid uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.hr_person_type FROM public.profiles p WHERE p.id = uid;
$$;

CREATE OR REPLACE FUNCTION public.user_can_read_hr_team_roster(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_rbac_role(
    ARRAY['owner', 'office_gc', 'office_drywall', 'viewer']::text[],
    uid
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_write_hr_team(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_rbac_role(
    ARRAY['owner', 'office_gc', 'office_drywall']::text[],
    uid
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_read_org_payroll(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_rbac_role(
    ARRAY['owner', 'office_gc', 'office_drywall', 'viewer']::text[],
    uid
  );
$$;

CREATE OR REPLACE FUNCTION public.user_is_hr_field_role(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_rbac_role(
    ARRAY['field_gc', 'field_drywall']::text[],
    uid
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_use_hr_timeclock_office(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_rbac_role(
    ARRAY['owner', 'office_gc', 'office_drywall']::text[],
    uid
  );
$$;

CREATE OR REPLACE FUNCTION public.pay_period_includes_linked_person(run_payload jsonb, uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.user_hr_person_id(uid) IS NOT NULL
    AND public.user_hr_person_type(uid) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(run_payload -> 'entries') = 'array' THEN run_payload -> 'entries'
          ELSE '[]'::jsonb
        END
      ) AS e(elem)
      WHERE (elem ->> 'personId') = public.user_hr_person_id(uid)
        AND (elem ->> 'personType') = public.user_hr_person_type(uid)
    );
$$;

CREATE OR REPLACE FUNCTION public.time_entry_matches_linked_person(
  entry_person_id text,
  entry_person_type text,
  uid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.user_hr_person_id(uid) IS NOT NULL
    AND public.user_hr_person_type(uid) IS NOT NULL
    AND entry_person_id = public.user_hr_person_id(uid)
    AND entry_person_type = public.user_hr_person_type(uid);
$$;

-- ---------------------------------------------------------------------------
-- 4) time_entries indexes (missing in prod)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_open_per_person
  ON public.time_entries (organization_id, person_type, person_id)
  WHERE (clock_out IS NULL);

CREATE INDEX IF NOT EXISTS time_entries_org_clock_in
  ON public.time_entries (organization_id, clock_in DESC);

-- ---------------------------------------------------------------------------
-- 5) org_team — replace legacy admin-only write + org-wide read
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view organization team" ON public.org_team;
DROP POLICY IF EXISTS "Admins can manage organization team" ON public.org_team;

CREATE POLICY org_team_hr_select ON public.org_team
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_read_hr_team_roster()
  );

CREATE POLICY org_team_hr_insert ON public.org_team
  FOR INSERT
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_write_hr_team()
  );

CREATE POLICY org_team_hr_update ON public.org_team
  FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_write_hr_team()
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_write_hr_team()
  );

CREATE POLICY org_team_hr_delete ON public.org_team
  FOR DELETE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_write_hr_team()
  );

-- ---------------------------------------------------------------------------
-- 6) pay_periods — replace org-wide CRUD with read split + payroll-write flag
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS pay_periods_org_select ON public.pay_periods;
DROP POLICY IF EXISTS pay_periods_org_insert ON public.pay_periods;
DROP POLICY IF EXISTS pay_periods_org_update ON public.pay_periods;
DROP POLICY IF EXISTS pay_periods_org_delete ON public.pay_periods;

CREATE POLICY pay_periods_hr_select ON public.pay_periods
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND (
      public.user_can_read_org_payroll()
      OR public.pay_period_includes_linked_person(payload)
    )
  );

CREATE POLICY pay_periods_hr_insert ON public.pay_periods
  FOR INSERT
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_run_payroll()
  );

CREATE POLICY pay_periods_hr_update ON public.pay_periods
  FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_run_payroll()
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_run_payroll()
  );

CREATE POLICY pay_periods_hr_delete ON public.pay_periods
  FOR DELETE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_run_payroll()
  );

-- ---------------------------------------------------------------------------
-- 7) time_entries — replace org-wide CRUD with office / field read-own
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS time_entries_select_own_org ON public.time_entries;
DROP POLICY IF EXISTS time_entries_insert_own_org ON public.time_entries;
DROP POLICY IF EXISTS time_entries_update_own_org ON public.time_entries;
DROP POLICY IF EXISTS time_entries_delete_own_org ON public.time_entries;

CREATE POLICY time_entries_hr_select ON public.time_entries
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND (
      public.user_can_use_hr_timeclock_office()
      OR public.time_entry_matches_linked_person(person_id, person_type)
    )
  );

CREATE POLICY time_entries_hr_insert ON public.time_entries
  FOR INSERT
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND (
      public.user_can_use_hr_timeclock_office()
      OR public.time_entry_matches_linked_person(person_id, person_type)
    )
  );

CREATE POLICY time_entries_hr_update ON public.time_entries
  FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND (
      public.user_can_use_hr_timeclock_office()
      OR public.time_entry_matches_linked_person(person_id, person_type)
    )
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND (
      public.user_can_use_hr_timeclock_office()
      OR public.time_entry_matches_linked_person(person_id, person_type)
    )
  );

CREATE POLICY time_entries_hr_delete ON public.time_entries
  FOR DELETE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_use_hr_timeclock_office()
  );

-- ---------------------------------------------------------------------------
-- 8) Post-apply assertions
-- ---------------------------------------------------------------------------
DO $postcheck$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'org_team';
  IF n <> 4 THEN RAISE EXCEPTION 'hr_phase_a: org_team policy count=%', n; END IF;

  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pay_periods';
  IF n <> 4 THEN RAISE EXCEPTION 'hr_phase_a: pay_periods policy count=%', n; END IF;

  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'time_entries';
  IF n <> 4 THEN RAISE EXCEPTION 'hr_phase_a: time_entries policy count=%', n; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'user_can_run_payroll' AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'hr_phase_a: user_can_run_payroll() missing';
  END IF;

  IF NOT (
    SELECT can_run_payroll FROM public.profiles WHERE lower(email) = 'mark@hshdrywall.com' LIMIT 1
  ) THEN
    RAISE EXCEPTION 'hr_phase_a: mark@hshdrywall.com must have can_run_payroll=true';
  END IF;
END;
$postcheck$;

COMMIT;

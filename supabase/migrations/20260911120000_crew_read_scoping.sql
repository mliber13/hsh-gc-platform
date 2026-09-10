-- Batch 1B — scope what a crew account can read.
-- See docs/briefs/BATCH_1B_CREW_READ_SCOPING.md. Follows 1A (95a28c8, eb06f06).
--
-- roles=['crew'] passed every org-scoped SELECT policy in the app. A crew account
-- could read every project's full metadata, every project's schedule, every
-- contact and estimate, and -- through one OR clause -- the whole payroll payload
-- for any period they appeared in. The assignment filter that makes the crew app
-- look scoped is client-side only.
--
-- Order matters: the crew_is_assigned_to_project fix comes first, because the
-- policies below make it load-bearing for reads.
--
-- Two carve-outs run through every policy here, and both are load-bearing:
--
--   user_is_field_foreman() -- a field foreman IS a roles=['crew'] profile, and
--   two features deliberately read the whole org for them: the /crew schedule
--   (crewWorkspaceService.fetchOrgScheduleRows) and the comms unread bell, which
--   upgrades a foreman to 'operator' scope and calls fetchDrywallProjects.
--   Without this term the foreman goes blank rather than erroring.
--
--   user_can_edit() -- a ['crew','office_drywall'] account is an operator who
--   also happens to hold crew. "Pure crew" is the thing being scoped, not
--   "holds crew".

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. crew_is_assigned_to_project — NULLIF, before anything depends on it
-- ---------------------------------------------------------------------------
--
-- Same bug 1A fixed in the clock RPCs: linked_employee_id = '' is not NULL, so
-- COALESCE returned the empty string, the <> '' guard failed, and the function
-- returned false for a linked contractor. Today that costs a photo upload. From
-- the policies below down it would cost them every project and every schedule
-- item -- silently, because an empty result set is not an error.
--
-- No profile on this database currently has an empty-string linked id, so this
-- is preventative rather than a repair.
CREATE OR REPLACE FUNCTION public.crew_is_assigned_to_project(
  p_project_id uuid,
  uid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  -- Same assignment predicate as crew_can_post_comms / fetchCrewProjectList:
  -- a schedule_items row on the project whose assigned_persons contains the
  -- caller's linked person id.
  SELECT
    public.user_has_crew_role(uid)
    AND EXISTS (
      SELECT 1
      FROM public.schedule_items si
      JOIN public.profiles p ON p.id = uid
      WHERE si.project_id = p_project_id
        AND si.organization_id = p.organization_id
        AND COALESCE(NULLIF(p.linked_employee_id, ''), NULLIF(p.linked_contractor_id, '')) IS NOT NULL
        AND COALESCE(NULLIF(p.linked_employee_id, ''), NULLIF(p.linked_contractor_id, '')) = ANY(si.assigned_persons)
    );
$fn$;

-- ---------------------------------------------------------------------------
-- 2. P0-SEC-2(a) — pay_periods handed a linked person everyone's pay
-- ---------------------------------------------------------------------------
--
-- RLS is row-level. pay_period_includes_linked_person asks "does this payload
-- mention me" and, if so, released the whole row: every person's hours, rates
-- and gross for that period. Any linked crew account could read it straight
-- from PostgREST.
--
-- Nothing in the app depended on the clause. Verified: the only client reads of
-- pay_periods are hrPayrollService (behind canRunPayroll) and the drywall labor
-- audit/aggregate services (operator-only); crewWorkspaceService never touches
-- the table; and get_my_paystub_entries / list_my_paystubs are SECURITY DEFINER,
-- so a future paystub screen does not need this policy either.
--
-- pay_period_includes_linked_person itself is left in place -- it is the right
-- predicate for a paystub RPC, just not for a row-level read.
DROP POLICY IF EXISTS pay_periods_hr_select ON public.pay_periods;
CREATE POLICY pay_periods_hr_select ON public.pay_periods
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_run_payroll()
  );

-- ---------------------------------------------------------------------------
-- 3. P0-SEC-2(b) — scope projects and schedule_items to assignment
-- ---------------------------------------------------------------------------
--
-- Operators short-circuit on the first term, so this costs them nothing.
--
-- schedule_items scopes to "items on a project I am assigned to", not "items
-- assigned to me". Regular crew already narrow to their own with
-- .contains('assigned_persons', [personId]), so the wider predicate is a
-- superset of what they read; the narrower one would break the foreman and the
-- job-detail schedule card.

DROP POLICY IF EXISTS "Users can view organization projects" ON public.projects;
CREATE POLICY "Users can view organization projects" ON public.projects
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND (
      NOT public.user_has_crew_role()
      OR public.user_can_edit()
      OR public.user_is_field_foreman()
      OR public.crew_is_assigned_to_project(id)
    )
  );

DROP POLICY IF EXISTS "Users can view organization schedule items" ON public.schedule_items;
CREATE POLICY "Users can view organization schedule items" ON public.schedule_items
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND (
      NOT public.user_has_crew_role()
      OR public.user_can_edit()
      OR public.user_is_field_foreman()
      OR public.crew_is_assigned_to_project(project_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4. P0-SEC-2(c) — exclude pure-crew from the operator tables
-- ---------------------------------------------------------------------------
--
-- Verified no crew surface reads any of these four: crewWorkspaceService has no
-- reference to contacts, labor_entries, material_entries or estimates, no
-- component under src/components/crew/ reads them directly, and the crew measure
-- save goes through the save_field_takeoff_as_measurer RPC rather than the
-- operator write path that counts estimates.

DROP POLICY IF EXISTS "Users can view organization contacts" ON public.contacts;
CREATE POLICY "Users can view organization contacts" ON public.contacts
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND NOT (public.user_has_crew_role() AND NOT public.user_can_edit())
  );

DROP POLICY IF EXISTS "Users can view organization estimates" ON public.estimates;
CREATE POLICY "Users can view organization estimates" ON public.estimates
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND NOT (public.user_has_crew_role() AND NOT public.user_can_edit())
  );

DROP POLICY IF EXISTS "Users can view organization labor entries" ON public.labor_entries;
CREATE POLICY "Users can view organization labor entries" ON public.labor_entries
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND NOT (public.user_has_crew_role() AND NOT public.user_can_edit())
  );

DROP POLICY IF EXISTS "Users can view organization material entries" ON public.material_entries;
CREATE POLICY "Users can view organization material entries" ON public.material_entries
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND NOT (public.user_has_crew_role() AND NOT public.user_can_edit())
  );

-- ---------------------------------------------------------------------------
-- 5. P1-SEC-6 — crew photo DELETE was org-wide
-- ---------------------------------------------------------------------------
--
-- dfp_auth_delete (20260529120000:99) let any crew account delete any field
-- photo anywhere in the org. Now a pure-crew caller may only delete under a
-- project they are assigned to.
--
-- Note for the report: dfp_auth_insert carries the identical org-wide predicate,
-- so uploads are not project-scoped either. Left alone here on purpose -- this
-- brief says report, do not fix -- but it wants the same treatment.
--
-- The project id is path segment 2 ({org}/{project}/...). This helper matches on
-- pr.id::text rather than casting the path to uuid, so a malformed name can only
-- fail to match; it can never raise a cast error inside a policy. Same idiom as
-- drywall_field_photo_path_ok.
CREATE OR REPLACE FUNCTION public.drywall_photo_crew_scope_ok(
  p_object_name text,
  uid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    NOT public.user_has_crew_role(uid)
    OR public.user_can_edit()
    OR public.user_is_field_foreman(uid)
    OR EXISTS (
      SELECT 1
      FROM public.projects pr
      WHERE pr.id::text = split_part(p_object_name, '/', 2)
        AND public.crew_is_assigned_to_project(pr.id, uid)
    );
$fn$;

COMMENT ON FUNCTION public.drywall_photo_crew_scope_ok(text, uuid) IS
  'True when the caller may act on a drywall-field-photos object: anyone who is not '
  'pure crew, plus a field foreman, plus a crew member assigned to the project in '
  'path segment 2. Fail-closed on a malformed path.';

DROP POLICY IF EXISTS dfp_auth_delete ON storage.objects;
CREATE POLICY dfp_auth_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'drywall-field-photos'
  AND public.user_can_access_drywall_photos(split_part(name, '/', 1), true)
  AND public.drywall_field_photo_path_ok(name)
  AND public.drywall_photo_crew_scope_ok(name)
);

-- ---------------------------------------------------------------------------
-- 6. P1-SEC-13 — profiles.email joins the privilege guard
-- ---------------------------------------------------------------------------
--
-- consume_crew_invite_token binds an invite to a person by matching
-- profiles.email against crew_invite_tokens.invited_email. A user who can
-- rewrite their own email can bind a leaked email-scoped invite to a different
-- roster person, and so to that person's pay.
--
-- Free to close: nothing in the app writes profiles.email after handle_new_user
-- sets it on INSERT, and the admin email script runs under the service role,
-- which the current_user exemption already lets through.
--
-- Everything else in this function is unchanged from 1A, including the reason it
-- must stay SECURITY INVOKER: the exemption reads current_user, which SECURITY
-- DEFINER would pin to this function's owner and disable the guard entirely.
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

  IF NEW.role                    IS DISTINCT FROM OLD.role
     OR NEW.roles                IS DISTINCT FROM OLD.roles
     OR NEW.email                IS DISTINCT FROM OLD.email
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

-- ---------------------------------------------------------------------------
-- 7. P1-SEC-14 — the owner/admin mismatch from 1A
-- ---------------------------------------------------------------------------
--
-- The 1A trigger admits user_is_rbac_owner() OR user_is_admin(), but this policy
-- admitted only user_is_admin(). Mark is both, so nothing is broken today -- but
-- the first rbac owner created without role='admin' would find the admin UI
-- failing at the policy instead of the trigger.
DROP POLICY IF EXISTS "Admins can update any profile in their organization" ON public.profiles;
CREATE POLICY "Admins can update any profile in their organization" ON public.profiles
  FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND (public.user_is_admin() OR public.user_is_rbac_owner())
  );

COMMIT;

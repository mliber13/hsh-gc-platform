-- Batch 1D — the systemic anon grant, and the write-policy gaps.
-- See docs/briefs/BATCH_1D_SYSTEMIC_GRANTS_AND_POLICY_GAPS.md.
-- Last of Batch 1. Follows 1A, 1B and 1C.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. P1-SEC-5 — revoke the schema-wide anon EXECUTE grant at its source
-- ---------------------------------------------------------------------------
--
-- All 77 SECURITY DEFINER functions in public carried anon=X. It never came
-- from any individual migration: pg_default_acl has an entry granted by
-- postgres for object type 'f' in schema public whose ACL includes
-- anon=X/postgres, so every function created by postgres inherited it at birth.
--
-- That is why the REVOKE ALL ... FROM PUBLIC lines scattered through the
-- migrations never cleared it. PUBLIC and anon are different grantees, and
-- revoking from PUBLIC does not touch a named grant. 20260806120000:40 is a
-- good example -- it revokes from PUBLIC and grants to authenticated, and the
-- function still ended up anon-executable.
--
-- Most of the 77 are harmless: they raise 'not authenticated' when auth.uid()
-- is null. The ones that are not are the predicates that take an explicit id
-- and answer a question about that person rather than about the caller.
-- Measured as the anon role before this migration:
--   comms_user_is_office('<a real uid>')     -> true
--   user_is_field_foreman('<a real uid>')    -> true
--   person_is_field_foreman('<a person id>') -> false
-- No content is reachable, but an anonymous caller who already holds an id
-- should not be able to confirm anything about it.

-- Stop new functions inheriting the grant. FOR ROLE postgres is required and
-- is the correct grantor: pg_default_acl records the entry against postgres,
-- and without FOR ROLE this statement silently does nothing.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- Clear the 77 already granted.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- The single deliberate exception. CrewSignupPage resolves the invite before
-- the user has an account, so this caller genuinely is anonymous
-- (crewInviteService.ts:117). The function is safe to expose: it is keyed on an
-- exact token and already filters consumed_at IS NULL AND expires_at > now().
--
-- crewInviteService's other RPC, consume_crew_invite_token, runs after sign-up
-- and needs authenticated only -- it is not re-granted here.
GRANT EXECUTE ON FUNCTION public.get_crew_invite_by_token(text) TO anon;

COMMENT ON FUNCTION public.get_crew_invite_by_token(text) IS
  'The only function in public that anon may execute. Crew signup calls it '
  'before the account exists, so the caller really is anonymous. Keyed on an '
  'exact token and filtered to unconsumed, unexpired invites. If you run '
  'another systemic anon revoke, re-grant this one or crew signup breaks at '
  'the first step -- and it breaks quietly, as "invite token is invalid".';

-- ---------------------------------------------------------------------------
-- 2. P1-SEC-5 remainder — four functions that trust their arguments
-- ---------------------------------------------------------------------------

-- 2a/2b. The quote-number allocators took an org id and used it unchecked, so
-- any authenticated caller could read another org's highest quote number off
-- the sequence. Single-org today, so nothing is exposed in practice. Checked
-- rather than derived, deliberately: dropping the parameter would mean
-- DROP FUNCTION, re-issuing grants, and changing every caller.
CREATE OR REPLACE FUNCTION public.next_drywall_quote_number(p_org uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_year int := EXTRACT(YEAR FROM now())::int;
  v_next int;
  v_lock_key bigint;
BEGIN
  IF p_org IS DISTINCT FROM public.get_user_organization_uuid() THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  v_lock_key := hashtextextended('drywall:' || p_org::text || ':' || v_year::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(
    NULLIF(
      regexp_replace(
        metadata->'legacy'->'quote'->>'quoteNumber',
        '^DW-' || v_year::text || '-',
        ''
      ),
      ''
    )::int
  ), 0) + 1
    INTO v_next
    FROM public.projects
    WHERE organization_id = p_org
      AND metadata->'legacy'->'quote'->>'quoteNumber' LIKE 'DW-' || v_year::text || '-%';

  RETURN 'DW-' || v_year::text || '-' || lpad(v_next::text, 3, '0');
END;
$fn$;

CREATE OR REPLACE FUNCTION public.next_client_quote_number(p_org uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_year int := EXTRACT(YEAR FROM now())::int;
  v_next int;
  v_lock_key bigint;
BEGIN
  IF p_org IS DISTINCT FROM public.get_user_organization_uuid() THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  v_lock_key := hashtextextended(p_org::text || ':' || v_year::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(quote_number, '^Q-' || v_year::text || '-', ''), '')::int
  ), 0) + 1
    INTO v_next
    FROM public.client_quotes
    WHERE organization_id = p_org
      AND quote_number LIKE 'Q-' || v_year::text || '-%';

  RETURN 'Q-' || v_year::text || '-' || lpad(v_next::text, 3, '0');
END;
$fn$;

-- 2c. display_name_for_user resolved any uid, including one in another org.
-- Now scoped to the caller's org by the final WHERE.
--
-- Fail-closed by construction: a caller with no org context (anon, or the
-- service role) gets NULL from get_user_organization_uuid(), the comparison
-- yields NULL, no row matches, and the function returns NULL. Every caller
-- already coalesces -- project_comms_lanes to 'Unknown',
-- forward_project_comms to 'The office' -- so that degrades to a generic name
-- rather than an error.
--
-- display_names_for_users(uuid[]) delegates here, so it is covered too.
CREATE OR REPLACE FUNCTION public.display_name_for_user(uid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE(
    -- Linked org_team member name (crew / subs) — authoritative.
    (
      SELECT NULLIF(trim(elem->>'name'), '')
      FROM public.org_team ot,
           jsonb_array_elements(COALESCE(ot.payload->'employees', '[]'::jsonb)) elem
      WHERE ot.organization_id = p.organization_id
        AND COALESCE(p.linked_employee_id, '') <> ''
        AND elem->>'id' = p.linked_employee_id
      LIMIT 1
    ),
    (
      SELECT NULLIF(trim(elem->>'name'), '')
      FROM public.org_team ot,
           jsonb_array_elements(COALESCE(ot.payload->'contractors1099', '[]'::jsonb)) elem
      WHERE ot.organization_id = p.organization_id
        AND COALESCE(p.linked_contractor_id, '') <> ''
        AND elem->>'id' = p.linked_contractor_id
      LIMIT 1
    ),
    -- Else the profile full name, but only if it's a real name (not an email).
    CASE
      WHEN p.full_name IS NOT NULL
        AND trim(p.full_name) <> ''
        AND position('@' in p.full_name) = 0
      THEN trim(p.full_name)
      ELSE NULL
    END
  )
  FROM public.profiles p
  WHERE p.id = uid
    AND p.organization_id = public.get_user_organization_uuid();
$fn$;

-- 2d. push_subscriptions.organization_id was client-supplied and unchecked --
-- the insert policy constrained user_id only, so a caller could file their
-- subscription under any org. pushService already sends requireUserOrgId(), so
-- pinning it here is a no-op for the real client.
DROP POLICY IF EXISTS push_subscriptions_insert_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_insert_own ON public.push_subscriptions
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id = public.get_user_organization_uuid()
  );

-- ---------------------------------------------------------------------------
-- 3. P1-SEC-4 — organizations had RLS switched off entirely
-- ---------------------------------------------------------------------------
--
-- relrowsecurity was false, so every row was readable by anyone who could
-- reach PostgREST, anon included. It is a Dashboard-created table with no
-- CREATE TABLE in any migration, which is how it escaped the RLS pass.
--
-- Safe to close: nothing reads it directly. No `from('organizations')` in src/
-- and none in supabase/functions/. The definer functions that join to it are
-- owned by postgres and bypass RLS, and the edge functions use the service
-- role, which also bypasses it.
--
-- SELECT only, deliberately. There is no policy for INSERT/UPDATE/DELETE, so
-- with RLS on they are denied to every client role -- org rows are created by
-- the service role or by hand, not by the app.
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_select_own ON public.organizations;
CREATE POLICY organizations_select_own ON public.organizations
  FOR SELECT
  USING (id = public.get_user_organization_uuid());

-- unsynced_qb_entries: does not exist on this database. Nothing to drop.

-- ---------------------------------------------------------------------------
-- 4. P1-SEC-11 — write policies gated on org membership alone
-- ---------------------------------------------------------------------------
--
-- Thirteen tables let any org member INSERT, UPDATE and DELETE. A viewer could
-- write, and before 1B so could a crew account. Each write policy below keeps
-- its existing org predicate exactly and gains AND public.user_can_edit().
--
-- user_can_edit() reads the legacy profiles.role column ('admin' or 'editor')
-- and, since 1A, also requires an active account. Checked against live data
-- before writing this: the legacy column and the RBAC array agree on every
-- profile -- admin/owner and editor/office_gc pass, viewer/viewer and
-- viewer/crew do not, and no office_drywall profile exists to fall through the
-- gap. In practice this removes write access from one human (a real viewer)
-- and from the crew accounts, which is the intent.
--
-- SELECT policies are untouched here. Role grants (TO authenticated vs the
-- default PUBLIC) are preserved per policy, as is the presence or absence of
-- WITH CHECK on each UPDATE.

-- communication_log_entries (TO authenticated; org via a profiles subquery)
DROP POLICY IF EXISTS comm_log_insert_own_org ON public.communication_log_entries;
CREATE POLICY comm_log_insert_own_org ON public.communication_log_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = (SELECT profiles.organization_id FROM profiles WHERE profiles.id = auth.uid())
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS comm_log_update_own_org ON public.communication_log_entries;
CREATE POLICY comm_log_update_own_org ON public.communication_log_entries
  FOR UPDATE TO authenticated
  USING (
    organization_id = (SELECT profiles.organization_id FROM profiles WHERE profiles.id = auth.uid())
    AND public.user_can_edit()
  )
  WITH CHECK (
    organization_id = (SELECT profiles.organization_id FROM profiles WHERE profiles.id = auth.uid())
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS comm_log_delete_own_org ON public.communication_log_entries;
CREATE POLICY comm_log_delete_own_org ON public.communication_log_entries
  FOR DELETE TO authenticated
  USING (
    organization_id = (SELECT profiles.organization_id FROM profiles WHERE profiles.id = auth.uid())
    AND public.user_can_edit()
  );

-- deals
DROP POLICY IF EXISTS "Users can create deals in their organization" ON public.deals;
CREATE POLICY "Users can create deals in their organization" ON public.deals
  FOR INSERT
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Users can update deals in their organization" ON public.deals;
CREATE POLICY "Users can update deals in their organization" ON public.deals
  FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Users can delete deals in their organization" ON public.deals;
CREATE POLICY "Users can delete deals in their organization" ON public.deals
  FOR DELETE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

-- org_holidays (org predicate uses current_user_organization_id + is_user_active)
DROP POLICY IF EXISTS "Active users can create org holidays" ON public.org_holidays;
CREATE POLICY "Active users can create org holidays" ON public.org_holidays
  FOR INSERT
  WITH CHECK (
    organization_id = public.current_user_organization_id()
    AND public.is_user_active()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Active users can update org holidays" ON public.org_holidays;
CREATE POLICY "Active users can update org holidays" ON public.org_holidays
  FOR UPDATE
  USING (
    organization_id = public.current_user_organization_id()
    AND public.is_user_active()
    AND public.user_can_edit()
  )
  WITH CHECK (
    organization_id = public.current_user_organization_id()
    AND public.is_user_active()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Active users can delete org holidays" ON public.org_holidays;
CREATE POLICY "Active users can delete org holidays" ON public.org_holidays
  FOR DELETE
  USING (
    organization_id = public.current_user_organization_id()
    AND public.is_user_active()
    AND public.user_can_edit()
  );

-- project_documents — ACTIVE-CORE. Confirmed the only accounts that write GC
-- documents (owner + the five office_gc editors) all pass user_can_edit().
DROP POLICY IF EXISTS "Users can create documents in their organization" ON public.project_documents;
CREATE POLICY "Users can create documents in their organization" ON public.project_documents
  FOR INSERT
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Users can update documents in their organization" ON public.project_documents;
CREATE POLICY "Users can update documents in their organization" ON public.project_documents
  FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Users can delete documents in their organization" ON public.project_documents;
CREATE POLICY "Users can delete documents in their organization" ON public.project_documents
  FOR DELETE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

-- selection_books
DROP POLICY IF EXISTS "Users can create selection books in their organization" ON public.selection_books;
CREATE POLICY "Users can create selection books in their organization" ON public.selection_books
  FOR INSERT
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Users can update selection books in their organization" ON public.selection_books;
CREATE POLICY "Users can update selection books in their organization" ON public.selection_books
  FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Users can delete selection books in their organization" ON public.selection_books;
CREATE POLICY "Users can delete selection books in their organization" ON public.selection_books
  FOR DELETE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

-- selection_rooms
DROP POLICY IF EXISTS "Users can create selection rooms in their organization" ON public.selection_rooms;
CREATE POLICY "Users can create selection rooms in their organization" ON public.selection_rooms
  FOR INSERT
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Users can update selection rooms in their organization" ON public.selection_rooms;
CREATE POLICY "Users can update selection rooms in their organization" ON public.selection_rooms
  FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Users can delete selection rooms in their organization" ON public.selection_rooms;
CREATE POLICY "Users can delete selection rooms in their organization" ON public.selection_rooms
  FOR DELETE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

-- selection_room_images
DROP POLICY IF EXISTS "Users can create selection room images in their organization" ON public.selection_room_images;
CREATE POLICY "Users can create selection room images in their organization" ON public.selection_room_images
  FOR INSERT
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Users can update selection room images in their organization" ON public.selection_room_images;
CREATE POLICY "Users can update selection room images in their organization" ON public.selection_room_images
  FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Users can delete selection room images in their organization" ON public.selection_room_images;
CREATE POLICY "Users can delete selection room images in their organization" ON public.selection_room_images
  FOR DELETE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

-- selection_room_spec_sheets
DROP POLICY IF EXISTS "Users can create spec sheets in their organization" ON public.selection_room_spec_sheets;
CREATE POLICY "Users can create spec sheets in their organization" ON public.selection_room_spec_sheets
  FOR INSERT
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Users can update spec sheets in their organization" ON public.selection_room_spec_sheets;
CREATE POLICY "Users can update spec sheets in their organization" ON public.selection_room_spec_sheets
  FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Users can delete spec sheets in their organization" ON public.selection_room_spec_sheets;
CREATE POLICY "Users can delete spec sheets in their organization" ON public.selection_room_spec_sheets
  FOR DELETE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

-- sub_items
DROP POLICY IF EXISTS "Users can create sub-items in their organization" ON public.sub_items;
CREATE POLICY "Users can create sub-items in their organization" ON public.sub_items
  FOR INSERT
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Users can update sub-items in their organization" ON public.sub_items;
CREATE POLICY "Users can update sub-items in their organization" ON public.sub_items
  FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Users can delete sub-items in their organization" ON public.sub_items;
CREATE POLICY "Users can delete sub-items in their organization" ON public.sub_items
  FOR DELETE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

-- subcontractor_unavailability
DROP POLICY IF EXISTS "Active users can create sub unavailability" ON public.subcontractor_unavailability;
CREATE POLICY "Active users can create sub unavailability" ON public.subcontractor_unavailability
  FOR INSERT
  WITH CHECK (
    organization_id = public.current_user_organization_id()
    AND public.is_user_active()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Active users can update sub unavailability" ON public.subcontractor_unavailability;
CREATE POLICY "Active users can update sub unavailability" ON public.subcontractor_unavailability
  FOR UPDATE
  USING (
    organization_id = public.current_user_organization_id()
    AND public.is_user_active()
    AND public.user_can_edit()
  )
  WITH CHECK (
    organization_id = public.current_user_organization_id()
    AND public.is_user_active()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Active users can delete sub unavailability" ON public.subcontractor_unavailability;
CREATE POLICY "Active users can delete sub unavailability" ON public.subcontractor_unavailability
  FOR DELETE
  USING (
    organization_id = public.current_user_organization_id()
    AND public.is_user_active()
    AND public.user_can_edit()
  );

-- tenant_pipeline_prospects
DROP POLICY IF EXISTS "Active users can create tenant pipeline prospects" ON public.tenant_pipeline_prospects;
CREATE POLICY "Active users can create tenant pipeline prospects" ON public.tenant_pipeline_prospects
  FOR INSERT
  WITH CHECK (
    organization_id = public.current_user_organization_id()
    AND public.is_user_active()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Active users can update tenant pipeline prospects" ON public.tenant_pipeline_prospects;
CREATE POLICY "Active users can update tenant pipeline prospects" ON public.tenant_pipeline_prospects
  FOR UPDATE
  USING (
    organization_id = public.current_user_organization_id()
    AND public.is_user_active()
    AND public.user_can_edit()
  )
  WITH CHECK (
    organization_id = public.current_user_organization_id()
    AND public.is_user_active()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Active users can delete tenant pipeline prospects" ON public.tenant_pipeline_prospects;
CREATE POLICY "Active users can delete tenant pipeline prospects" ON public.tenant_pipeline_prospects
  FOR DELETE
  USING (
    organization_id = public.current_user_organization_id()
    AND public.is_user_active()
    AND public.user_can_edit()
  );

-- trade_categories (TO authenticated)
DROP POLICY IF EXISTS trade_categories_insert_org_only ON public.trade_categories;
CREATE POLICY trade_categories_insert_org_only ON public.trade_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS trade_categories_update_org_only ON public.trade_categories;
CREATE POLICY trade_categories_update_org_only ON public.trade_categories
  FOR UPDATE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS trade_categories_delete_org_only ON public.trade_categories;
CREATE POLICY trade_categories_delete_org_only ON public.trade_categories
  FOR DELETE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

-- sow_templates — also item 2e.
--
-- The DELETE policy (014_update_sow_template_delete_policy.sql, widened again
-- by 20260427000001:37) admitted three cases, and the third was
-- (user_id IS NULL AND organization_id IS NULL): a system template seeded by
-- 012, deletable by any authenticated user in any org. That clause now also
-- requires admin or owner. The first two cases are unchanged apart from the
-- editor gate.
DROP POLICY IF EXISTS "Users can create own SOW templates" ON public.sow_templates;
CREATE POLICY "Users can create own SOW templates" ON public.sow_templates
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.user_can_edit());

DROP POLICY IF EXISTS "Users can update own SOW templates" ON public.sow_templates;
CREATE POLICY "Users can update own SOW templates" ON public.sow_templates
  FOR UPDATE
  USING (auth.uid() = user_id AND public.user_can_edit());

DROP POLICY IF EXISTS "Users can manage SOW templates they can access" ON public.sow_templates;
CREATE POLICY "Users can manage SOW templates they can access" ON public.sow_templates
  FOR DELETE
  USING (
    public.user_can_edit()
    AND (
      auth.uid() = user_id
      OR (organization_id IS NOT NULL AND organization_id = public.get_user_organization_uuid())
      OR (
        user_id IS NULL
        AND organization_id IS NULL
        AND (public.user_is_admin() OR public.user_is_rbac_owner())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Carry-over from 1B — dfp_auth_insert was org-wide
-- ---------------------------------------------------------------------------
--
-- 1B scoped the crew photo DELETE to assigned projects and reported that the
-- INSERT policy carried the identical org-wide predicate, so a crew account
-- could still upload into any project's folder in the org. Same term, same
-- helper, so the two policies now agree.
DROP POLICY IF EXISTS dfp_auth_insert ON storage.objects;
CREATE POLICY dfp_auth_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'drywall-field-photos'
  AND public.user_can_access_drywall_photos(split_part(name, '/', 1), true)
  AND public.drywall_field_photo_path_ok(name)
  AND public.drywall_photo_crew_scope_ok(name)
);

COMMIT;

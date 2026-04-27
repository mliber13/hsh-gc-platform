-- ============================================================
-- A5-c.2 chunk C2-4a: change_orders, project_actuals, project_proforma_versions
-- ============================================================
-- This is the routine half of C2-4. The complex half (C2-4b: po_headers,
-- po_lines, proforma_inputs with cross-table JOIN and owner-based mixed
-- patterns) ships separately for careful review.
--
-- Applies to both branch (clqgnnydrwpgxvipyotd) and prod (rvtdavpsvrhbktbxquzm).
-- See docs/A5C2_C4A_CHANGE_ORDERS_ACTUALS_VERSIONS.md and A5_PLAN.md §10.
--
-- Scope: 10 policies total
--   change_orders             : 2 (1 SELECT + 1 FOR ALL)            — uniform
--   project_actuals           : 4 (SELECT/INSERT/UPDATE/DELETE)     — DELETE admin-only
--   project_proforma_versions : 4 (SELECT/INSERT/UPDATE/DELETE)     — no role gating
--
-- Note on project_proforma_versions policy names: 3 of 4 names are
-- truncated to 63 chars by Postgres NAMEDATALEN, ending in
-- "...in their organizatio" instead of "...in their organization".
-- Names preserved verbatim for DROP IF EXISTS.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. Pre-flight invariants
-- ------------------------------------------------------------
DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='get_user_organization_uuid'
  ) THEN RAISE EXCEPTION 'c2-4a preflight: public.get_user_organization_uuid() missing'; END IF;

  IF EXISTS (SELECT 1 FROM public.change_orders             WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-4a preflight: change_orders has NULL organization_id_uuid rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.project_actuals           WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-4a preflight: project_actuals has NULL organization_id_uuid rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.project_proforma_versions WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-4a preflight: project_proforma_versions has NULL organization_id_uuid rows'; END IF;
END
$preflight$;

-- ------------------------------------------------------------
-- 1. change_orders  (1 SELECT + 1 FOR ALL)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view organization change orders" ON public.change_orders;
CREATE POLICY "Users can view organization change orders" ON public.change_orders
  FOR SELECT USING (
    organization_id_uuid = public.get_user_organization_uuid()
    AND public.is_user_active()
  );

DROP POLICY IF EXISTS "Editors and admins can manage change orders" ON public.change_orders;
CREATE POLICY "Editors and admins can manage change orders" ON public.change_orders
  FOR ALL USING (
    organization_id_uuid = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

-- ------------------------------------------------------------
-- 2. project_actuals  (4 policies; DELETE admin-only)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view organization actuals" ON public.project_actuals;
CREATE POLICY "Users can view organization actuals" ON public.project_actuals
  FOR SELECT USING (
    organization_id_uuid = public.get_user_organization_uuid()
    AND public.is_user_active()
  );

DROP POLICY IF EXISTS "Editors and admins can create actuals" ON public.project_actuals;
CREATE POLICY "Editors and admins can create actuals" ON public.project_actuals
  FOR INSERT WITH CHECK (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Editors and admins can update actuals" ON public.project_actuals;
CREATE POLICY "Editors and admins can update actuals" ON public.project_actuals
  FOR UPDATE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Only admins can delete actuals" ON public.project_actuals;
CREATE POLICY "Only admins can delete actuals" ON public.project_actuals
  FOR DELETE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
    AND public.user_is_admin()
  );

-- ------------------------------------------------------------
-- 3. project_proforma_versions  (4 policies; 3 names are truncated to 63 chars)
-- ------------------------------------------------------------
-- SELECT name fits 62 chars (no truncation)
DROP POLICY IF EXISTS "Users can view project proforma versions in their organization" ON public.project_proforma_versions;
CREATE POLICY "Users can view project proforma versions in their organization" ON public.project_proforma_versions
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid());

-- INSERT: name truncated to 63 chars (ends in "organizatio")
DROP POLICY IF EXISTS "Users can create project proforma versions in their organizatio" ON public.project_proforma_versions;
CREATE POLICY "Users can create project proforma versions in their organizatio" ON public.project_proforma_versions
  FOR INSERT WITH CHECK (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

-- UPDATE: name truncated to 63 chars
DROP POLICY IF EXISTS "Users can update project proforma versions in their organizatio" ON public.project_proforma_versions;
CREATE POLICY "Users can update project proforma versions in their organizatio" ON public.project_proforma_versions
  FOR UPDATE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

-- DELETE: name truncated to 63 chars
DROP POLICY IF EXISTS "Users can delete project proforma versions in their organizatio" ON public.project_proforma_versions;
CREATE POLICY "Users can delete project proforma versions in their organizatio" ON public.project_proforma_versions
  FOR DELETE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

-- ------------------------------------------------------------
-- 4. Post-apply assertions
-- ------------------------------------------------------------
DO $postcheck$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('change_orders','project_actuals','project_proforma_versions');
  IF n <> 10 THEN RAISE EXCEPTION 'c2-4a postcheck: combined policy count is %, expected 10', n; END IF;

  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='change_orders';
  IF n <> 2 THEN RAISE EXCEPTION 'c2-4a postcheck: change_orders has % policies, expected 2', n; END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='project_actuals';
  IF n <> 4 THEN RAISE EXCEPTION 'c2-4a postcheck: project_actuals has % policies, expected 4', n; END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='project_proforma_versions';
  IF n <> 4 THEN RAISE EXCEPTION 'c2-4a postcheck: project_proforma_versions has % policies, expected 4', n; END IF;

  -- No bare text-column references remain
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('change_orders','project_actuals','project_proforma_versions')
     AND (
       (qual       IS NOT NULL AND qual       ~ 'organization_id[^_]')
       OR
       (with_check IS NOT NULL AND with_check ~ 'organization_id[^_]')
     );
  IF n > 0 THEN RAISE EXCEPTION 'c2-4a postcheck: % policies still reference text organization_id', n; END IF;
END
$postcheck$;

COMMIT;

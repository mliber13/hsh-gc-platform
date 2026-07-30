-- ============================================================
-- A5-c.2 chunk C2-3: estimates / trades / templates / sub_items UUID-based RLS
-- Tables: estimates, estimate_templates, trades, sub_items, item_templates
-- ============================================================
-- Applies to both branch (clqgnnydrwpgxvipyotd) and prod (rvtdavpsvrhbktbxquzm).
-- Idempotent: DROP POLICY IF EXISTS handles each env's policy names (which match).
-- See docs/A5C2_C3_ESTIMATES_TRADES.md and docs/A5_PLAN.md §10.
--
-- Scope: 16 policies total
--   estimates          : 4 (SELECT, INSERT, UPDATE, DELETE)         — separate
--   estimate_templates : 2 (SELECT, ALL)                            — combined ALL
--   trades             : 4 (SELECT, INSERT, UPDATE, DELETE)         — separate
--   item_templates     : 2 (SELECT, ALL)                            — combined ALL
--   sub_items          : 4 (SELECT, INSERT, UPDATE, DELETE)         — separate, no role gate
--
-- All policies converge to:
--   organization_id_uuid = public.get_user_organization_uuid()
-- with role gates (user_can_edit, user_is_admin, is_user_active) PRESERVED
-- exactly as they exist today. INSERT/UPDATE/DELETE on tables that don't already
-- have role gating get the standard IS NOT NULL guard for defense-in-depth.
--
-- Pre-existing semantic preserved verbatim:
--   - estimates DELETE requires user_is_admin
--   - trades    DELETE requires user_can_edit (NOT admin) — different from estimates
--   - sub_items has no role gating (any active user in org)
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
  ) THEN RAISE EXCEPTION 'c2-3 preflight: public.get_user_organization_uuid() missing'; END IF;

  IF EXISTS (SELECT 1 FROM public.estimates          WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-3 preflight: estimates has NULL organization_id_uuid rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.estimate_templates WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-3 preflight: estimate_templates has NULL organization_id_uuid rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.trades             WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-3 preflight: trades has NULL organization_id_uuid rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.sub_items          WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-3 preflight: sub_items has NULL organization_id_uuid rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.item_templates     WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-3 preflight: item_templates has NULL organization_id_uuid rows'; END IF;
END
$preflight$;

-- ------------------------------------------------------------
-- 1. estimates  (4 policies, SELECT/INSERT/UPDATE separate, DELETE admin-only)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view organization estimates" ON public.estimates;
CREATE POLICY "Users can view organization estimates" ON public.estimates
  FOR SELECT USING (
    organization_id_uuid = public.get_user_organization_uuid()
    AND public.is_user_active()
  );

DROP POLICY IF EXISTS "Editors and admins can create estimates" ON public.estimates;
CREATE POLICY "Editors and admins can create estimates" ON public.estimates
  FOR INSERT WITH CHECK (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Editors and admins can update estimates" ON public.estimates;
CREATE POLICY "Editors and admins can update estimates" ON public.estimates
  FOR UPDATE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Only admins can delete estimates" ON public.estimates;
CREATE POLICY "Only admins can delete estimates" ON public.estimates
  FOR DELETE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
    AND public.user_is_admin()
  );

-- ------------------------------------------------------------
-- 2. estimate_templates  (1 SELECT + 1 FOR ALL)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view organization estimate templates" ON public.estimate_templates;
CREATE POLICY "Users can view organization estimate templates" ON public.estimate_templates
  FOR SELECT USING (
    organization_id_uuid = public.get_user_organization_uuid()
    AND public.is_user_active()
  );

DROP POLICY IF EXISTS "Editors and admins can manage estimate templates" ON public.estimate_templates;
CREATE POLICY "Editors and admins can manage estimate templates" ON public.estimate_templates
  FOR ALL USING (
    organization_id_uuid = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

-- ------------------------------------------------------------
-- 3. trades  (4 policies; DELETE uses user_can_edit, not user_is_admin)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view organization trades" ON public.trades;
CREATE POLICY "Users can view organization trades" ON public.trades
  FOR SELECT USING (
    organization_id_uuid = public.get_user_organization_uuid()
    AND public.is_user_active()
  );

DROP POLICY IF EXISTS "Editors and admins can create trades" ON public.trades;
CREATE POLICY "Editors and admins can create trades" ON public.trades
  FOR INSERT WITH CHECK (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Editors and admins can update trades" ON public.trades;
CREATE POLICY "Editors and admins can update trades" ON public.trades
  FOR UPDATE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Editors and admins can delete trades" ON public.trades;
CREATE POLICY "Editors and admins can delete trades" ON public.trades
  FOR DELETE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

-- ------------------------------------------------------------
-- 4. item_templates  (1 SELECT + 1 FOR ALL)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view organization item templates" ON public.item_templates;
CREATE POLICY "Users can view organization item templates" ON public.item_templates
  FOR SELECT USING (
    organization_id_uuid = public.get_user_organization_uuid()
    AND public.is_user_active()
  );

DROP POLICY IF EXISTS "Editors and admins can manage item templates" ON public.item_templates;
CREATE POLICY "Editors and admins can manage item templates" ON public.item_templates
  FOR ALL USING (
    organization_id_uuid = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

-- ------------------------------------------------------------
-- 5. sub_items  (4 policies, no role gating — any active user in org)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view sub-items in their organization" ON public.sub_items;
CREATE POLICY "Users can view sub-items in their organization" ON public.sub_items
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid());

DROP POLICY IF EXISTS "Users can create sub-items in their organization" ON public.sub_items;
CREATE POLICY "Users can create sub-items in their organization" ON public.sub_items
  FOR INSERT WITH CHECK (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

DROP POLICY IF EXISTS "Users can update sub-items in their organization" ON public.sub_items;
CREATE POLICY "Users can update sub-items in their organization" ON public.sub_items
  FOR UPDATE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

DROP POLICY IF EXISTS "Users can delete sub-items in their organization" ON public.sub_items;
CREATE POLICY "Users can delete sub-items in their organization" ON public.sub_items
  FOR DELETE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

-- ------------------------------------------------------------
-- 6. Post-apply assertions
-- ------------------------------------------------------------
DO $postcheck$
DECLARE
  n int;
BEGIN
  -- 4 + 2 + 4 + 2 + 4 = 16 policies expected
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('estimates','estimate_templates','trades','sub_items','item_templates');
  IF n <> 16 THEN RAISE EXCEPTION 'c2-3 postcheck: estimate/trade subsystem has % policies, expected 16', n; END IF;

  -- Per-table policy counts
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='estimates';
  IF n <> 4 THEN RAISE EXCEPTION 'c2-3 postcheck: estimates has % policies, expected 4', n; END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='estimate_templates';
  IF n <> 2 THEN RAISE EXCEPTION 'c2-3 postcheck: estimate_templates has % policies, expected 2', n; END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='trades';
  IF n <> 4 THEN RAISE EXCEPTION 'c2-3 postcheck: trades has % policies, expected 4', n; END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='item_templates';
  IF n <> 2 THEN RAISE EXCEPTION 'c2-3 postcheck: item_templates has % policies, expected 2', n; END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='sub_items';
  IF n <> 4 THEN RAISE EXCEPTION 'c2-3 postcheck: sub_items has % policies, expected 4', n; END IF;

  -- No bare text-column references remain
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('estimates','estimate_templates','trades','sub_items','item_templates')
     AND (
       (qual       IS NOT NULL AND qual       ~ 'organization_id[^_]')
       OR
       (with_check IS NOT NULL AND with_check ~ 'organization_id[^_]')
     );
  IF n > 0 THEN RAISE EXCEPTION 'c2-3 postcheck: % estimate/trade-subsystem policies still reference text organization_id', n; END IF;
END
$postcheck$;

COMMIT;

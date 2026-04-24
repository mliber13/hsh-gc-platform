-- ============================================================
-- A5-c.2 chunk C2-1 (pilot): UUID-based RLS policies
-- Tables: public.projects, public.profiles, public.trade_categories
-- ============================================================
-- Applies to both branch (clqgnnydrwpgxvipyotd) and prod (rvtdavpsvrhbktbxquzm).
-- Idempotent: DROP POLICY IF EXISTS handles both branch and prod policy names.
-- See docs/A5C2_C1_PILOT.md and docs/A5_PLAN.md §10.
--
-- Convergence scope (vs. minimal "rewrite policies" plan):
--   1. Create get_user_organization_uuid() on branch (no-op on prod).
--   2. DROP NOT NULL on profiles.organization_id (no-op on prod).
--   3. Add "Users can view own profile" SELECT policy
--      (no-op on branch; plugs prod invite-first hole).
--   4. Replace trade_categories legacy is_system/'system' text model
--      with NULL-is-shared model (no-op on branch).
--   5. Rewrite projects + profiles org-scoped policies to filter on
--      organization_id_uuid via get_user_organization_uuid().
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. Pre-flight invariants (fail-hard)
-- ------------------------------------------------------------
DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'user_can_edit'
  ) THEN RAISE EXCEPTION 'c2-1 preflight: public.user_can_edit() missing'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'user_is_admin'
  ) THEN RAISE EXCEPTION 'c2-1 preflight: public.user_is_admin() missing'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_user_active'
  ) THEN RAISE EXCEPTION 'c2-1 preflight: public.is_user_active() missing'; END IF;

  IF EXISTS (SELECT 1 FROM public.projects WHERE organization_id_uuid IS NULL) THEN
    RAISE EXCEPTION 'c2-1 preflight: public.projects has rows with NULL organization_id_uuid; backfill required before policy rewrite';
  END IF;
END
$preflight$;

-- ------------------------------------------------------------
-- 1. get_user_organization_uuid()  (matches prod def byte-for-byte)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_organization_uuid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT organization_id_uuid FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$fn$;

-- ------------------------------------------------------------
-- 2. profiles: DROP NOT NULL + rewrite policies
-- ------------------------------------------------------------
ALTER TABLE public.profiles ALTER COLUMN organization_id DROP NOT NULL;

-- SELECT: own profile (plugs invite-first hole on prod; no-op on branch)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- SELECT: other profiles in same org
DROP POLICY IF EXISTS "Users can view profiles in their organization" ON public.profiles;
CREATE POLICY "Users can view profiles in their organization" ON public.profiles
  FOR SELECT USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
    AND public.is_user_active()
  );

-- UPDATE: own profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id AND public.is_user_active());

-- UPDATE: admin edits any profile in same org
DROP POLICY IF EXISTS "Admins can update any profile in their organization" ON public.profiles;
CREATE POLICY "Admins can update any profile in their organization" ON public.profiles
  FOR UPDATE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
    AND public.user_is_admin()
  );

-- INSERT: admin creates profile in own org
DROP POLICY IF EXISTS "Admins can insert profiles for their organization" ON public.profiles;
CREATE POLICY "Admins can insert profiles for their organization" ON public.profiles
  FOR INSERT WITH CHECK (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
    AND public.user_is_admin()
  );

-- ------------------------------------------------------------
-- 3. projects: rewrite policies
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view organization projects" ON public.projects;
CREATE POLICY "Users can view organization projects" ON public.projects
  FOR SELECT USING (
    organization_id_uuid = public.get_user_organization_uuid()
    AND public.is_user_active()
  );

DROP POLICY IF EXISTS "Editors and admins can create projects" ON public.projects;
CREATE POLICY "Editors and admins can create projects" ON public.projects
  FOR INSERT WITH CHECK (
    organization_id_uuid = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Editors and admins can update projects" ON public.projects;
CREATE POLICY "Editors and admins can update projects" ON public.projects
  FOR UPDATE USING (
    organization_id_uuid = public.get_user_organization_uuid()
    AND public.user_can_edit()
  );

DROP POLICY IF EXISTS "Only admins can delete projects" ON public.projects;
CREATE POLICY "Only admins can delete projects" ON public.projects
  FOR DELETE USING (
    organization_id_uuid = public.get_user_organization_uuid()
    AND public.user_is_admin()
  );

-- ------------------------------------------------------------
-- 4. trade_categories: NULL-is-shared model, rewrite policies
--    DROPs cover both prod legacy names AND branch new names so
--    the migration converges both envs to the same final state.
-- ------------------------------------------------------------
-- Legacy prod names
DROP POLICY IF EXISTS "Users can view system and own org trade categories" ON public.trade_categories;
DROP POLICY IF EXISTS "Users can create own org trade categories" ON public.trade_categories;
DROP POLICY IF EXISTS "Users can update own org non-system trade categories" ON public.trade_categories;
DROP POLICY IF EXISTS "Users can delete own org non-system trade categories" ON public.trade_categories;
-- Branch / target names
DROP POLICY IF EXISTS trade_categories_select_shared_or_org ON public.trade_categories;
DROP POLICY IF EXISTS trade_categories_insert_org_only     ON public.trade_categories;
DROP POLICY IF EXISTS trade_categories_update_org_only     ON public.trade_categories;
DROP POLICY IF EXISTS trade_categories_delete_org_only     ON public.trade_categories;

CREATE POLICY trade_categories_select_shared_or_org ON public.trade_categories
  FOR SELECT TO authenticated
  USING (
    organization_id_uuid IS NULL
    OR organization_id_uuid = public.get_user_organization_uuid()
  );

CREATE POLICY trade_categories_insert_org_only ON public.trade_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

CREATE POLICY trade_categories_update_org_only ON public.trade_categories
  FOR UPDATE TO authenticated
  USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  )
  WITH CHECK (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

CREATE POLICY trade_categories_delete_org_only ON public.trade_categories
  FOR DELETE TO authenticated
  USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

-- ------------------------------------------------------------
-- 5. Post-apply assertions (fail-hard if target state not met)
-- ------------------------------------------------------------
DO $postcheck$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='profiles';
  IF n <> 5 THEN RAISE EXCEPTION 'c2-1 postcheck: profiles has % policies, expected 5', n; END IF;

  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='projects';
  IF n <> 4 THEN RAISE EXCEPTION 'c2-1 postcheck: projects has % policies, expected 4', n; END IF;

  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='trade_categories';
  IF n <> 4 THEN RAISE EXCEPTION 'c2-1 postcheck: trade_categories has % policies, expected 4', n; END IF;

  -- No policy on our 3 tables references bare organization_id (text) anymore.
  -- Regex: "organization_id" followed by a non-underscore rules out organization_id_uuid.
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('projects','profiles','trade_categories')
     AND (
       (qual       IS NOT NULL AND qual       ~ 'organization_id[^_]')
       OR
       (with_check IS NOT NULL AND with_check ~ 'organization_id[^_]')
     );
  IF n > 0 THEN RAISE EXCEPTION 'c2-1 postcheck: % policies on target tables still reference text organization_id', n; END IF;

  -- profiles.organization_id must be nullable after step 2
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles'
      AND column_name='organization_id' AND is_nullable='NO'
  ) THEN RAISE EXCEPTION 'c2-1 postcheck: profiles.organization_id still NOT NULL'; END IF;
END
$postcheck$;

COMMIT;

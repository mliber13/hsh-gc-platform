-- ============================================================
-- A5-c.2 chunk C2-11: UUID-native fixes (sow_templates only)
-- ============================================================
-- sow_templates.organization_id is already uuid type (from original schema).
-- Two policy fixes needed to converge branch and prod:
--   1. SELECT "Users can view organization SOW templates":
--      Branch had a tautology bug (profiles.organization_id_uuid = profiles.organization_id_uuid).
--      Prod already correct from A5-c side-fix. Migration converges branch.
--   2. DELETE "Users can manage SOW templates they can access":
--      Prod had a dead branch (organization_id::text vs profiles.organization_id text)
--      that never matches because the LHS is uuid-as-text.
--      Branch already correct. Migration converges prod.
--
-- quote_requests intentionally NOT touched. Its policies don't filter on org_id at all
-- (owner-based + token-based-public). The H24 vulnerability (`qual: true` public read) is
-- a separate concern that needs careful product/security review — out of A5 scope.
-- ============================================================

BEGIN;

DO $preflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_user_organization_uuid')
    THEN RAISE EXCEPTION 'c2-11 preflight: get_user_organization_uuid() missing'; END IF;
END $preflight$;

-- sow_templates SELECT (org-scoped — fix branch tautology, no-op on prod)
DROP POLICY IF EXISTS "Users can view organization SOW templates" ON public.sow_templates;
CREATE POLICY "Users can view organization SOW templates" ON public.sow_templates
  FOR SELECT USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_uuid()
  );

-- sow_templates DELETE (multi-branch — fix prod cast-to-text dead branch, no-op on branch)
DROP POLICY IF EXISTS "Users can manage SOW templates they can access" ON public.sow_templates;
CREATE POLICY "Users can manage SOW templates they can access" ON public.sow_templates
  FOR DELETE USING (
    auth.uid() = user_id
    OR (
      organization_id IS NOT NULL
      AND organization_id = public.get_user_organization_uuid()
    )
    OR (user_id IS NULL AND organization_id IS NULL)
  );

DO $postcheck$
DECLARE n int;
BEGIN
  -- 6 sow_templates policies expected (4 owner-based + 1 org-SELECT + 1 system-SELECT)
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='sow_templates';
  IF n <> 6 THEN RAISE EXCEPTION 'c2-11 postcheck: sow_templates has % policies, expected 6', n; END IF;

  -- Verify the 2 fixed policies don't reference profile self-comparisons or text casts
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename='sow_templates'
     AND (
       -- branch tautology pattern
       (qual IS NOT NULL AND qual ~ 'profiles\.organization_id_uuid = profiles\.organization_id_uuid')
       OR (with_check IS NOT NULL AND with_check ~ 'profiles\.organization_id_uuid = profiles\.organization_id_uuid')
       -- prod cast-to-text dead branch
       OR (qual IS NOT NULL AND qual ~ '\(organization_id\)::text')
       OR (with_check IS NOT NULL AND with_check ~ '\(organization_id\)::text')
     );
  IF n > 0 THEN RAISE EXCEPTION 'c2-11 postcheck: % sow_templates policies still contain known bug patterns', n; END IF;
END $postcheck$;

COMMIT;

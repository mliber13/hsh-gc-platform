-- ============================================================
-- A5-c.2 chunk C2-6: forms subsystem
-- Tables: form_templates, form_responses, project_forms
-- ============================================================
-- Applies to both branch (clqgnnydrwpgxvipyotd) and prod (rvtdavpsvrhbktbxquzm).
-- See docs/A5C2_C6_FORMS.md and A5_PLAN.md §10.
--
-- Scope:
--   - 8 policies rewritten across 3 tables
--   - One drive-by H26 fix: ENABLE ROW LEVEL SECURITY on project_forms
--     (existing policies were defined but RLS was disabled, so the policies
--      were inert. C2-6 makes them actually enforce.)
--
-- Pre-existing semantics preserved:
--   - form_templates / form_responses: 1 SELECT (active) + 1 FOR ALL (editor)
--   - project_forms: separate SELECT/INSERT/UPDATE/DELETE; DELETE admin-only
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
  ) THEN RAISE EXCEPTION 'c2-6 preflight: public.get_user_organization_uuid() missing'; END IF;

  IF EXISTS (SELECT 1 FROM public.form_templates WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-6 preflight: form_templates has NULL uuid rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.form_responses WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-6 preflight: form_responses has NULL uuid rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.project_forms  WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-6 preflight: project_forms has NULL uuid rows'; END IF;
END
$preflight$;

-- ------------------------------------------------------------
-- 1. form_templates  (1 SELECT + 1 FOR ALL)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view organization form templates" ON public.form_templates;
CREATE POLICY "Users can view organization form templates" ON public.form_templates
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());

DROP POLICY IF EXISTS "Editors and admins can manage form templates" ON public.form_templates;
CREATE POLICY "Editors and admins can manage form templates" ON public.form_templates
  FOR ALL USING (organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

-- ------------------------------------------------------------
-- 2. form_responses  (1 SELECT + 1 FOR ALL)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view organization form responses" ON public.form_responses;
CREATE POLICY "Users can view organization form responses" ON public.form_responses
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());

DROP POLICY IF EXISTS "Editors and admins can manage form responses" ON public.form_responses;
CREATE POLICY "Editors and admins can manage form responses" ON public.form_responses
  FOR ALL USING (organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

-- ------------------------------------------------------------
-- 3. project_forms  (4 separate policies; DELETE admin-only; ENABLE RLS — H26 fix)
-- ------------------------------------------------------------
-- H26 drive-by: enable RLS so the existing-but-inert policies actually enforce.
ALTER TABLE public.project_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view organization project forms" ON public.project_forms;
CREATE POLICY "Users can view organization project forms" ON public.project_forms
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());

DROP POLICY IF EXISTS "Editors and admins can create project forms" ON public.project_forms;
CREATE POLICY "Editors and admins can create project forms" ON public.project_forms
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

DROP POLICY IF EXISTS "Editors and admins can update project forms" ON public.project_forms;
CREATE POLICY "Editors and admins can update project forms" ON public.project_forms
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

DROP POLICY IF EXISTS "Only admins can delete project forms" ON public.project_forms;
CREATE POLICY "Only admins can delete project forms" ON public.project_forms
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_is_admin());

-- ------------------------------------------------------------
-- 4. Post-apply assertions
-- ------------------------------------------------------------
DO $postcheck$
DECLARE
  n int;
  rls boolean;
BEGIN
  -- Total: 2 + 2 + 4 = 8
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename IN ('form_templates','form_responses','project_forms');
  IF n <> 8 THEN RAISE EXCEPTION 'c2-6 postcheck: combined policy count is %, expected 8', n; END IF;

  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='form_templates'; IF n <> 2 THEN RAISE EXCEPTION 'c2-6 postcheck: form_templates=%', n; END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='form_responses'; IF n <> 2 THEN RAISE EXCEPTION 'c2-6 postcheck: form_responses=%', n; END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='project_forms';  IF n <> 4 THEN RAISE EXCEPTION 'c2-6 postcheck: project_forms=%', n; END IF;

  -- H26 fix: project_forms RLS must be enabled
  SELECT relrowsecurity INTO rls FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
   WHERE ns.nspname='public' AND c.relname='project_forms';
  IF rls IS NOT TRUE THEN RAISE EXCEPTION 'c2-6 postcheck: project_forms RLS not enabled (H26 fix failed)'; END IF;

  -- No bare text-column references remain
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('form_templates','form_responses','project_forms')
     AND (
       (qual       IS NOT NULL AND qual       ~ 'organization_id[^_]')
       OR
       (with_check IS NOT NULL AND with_check ~ 'organization_id[^_]')
     );
  IF n > 0 THEN RAISE EXCEPTION 'c2-6 postcheck: % policies still reference text organization_id', n; END IF;
END
$postcheck$;

COMMIT;

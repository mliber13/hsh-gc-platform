-- ============================================================
-- A5-c.2 chunks C2-9 + C2-10 (combined): project meta + infra/misc
-- 11 tables, 38 policies (16 standard rewrites + 18 existing + 4 new for H26 RLS-enable)
--
-- H26 drive-by fixes: enable RLS + create initial policies on 3 tables that
-- had RLS disabled with no policies (project_events, work_packages, org_team).
-- New policies follow existing peer patterns.
-- ============================================================

BEGIN;

DO $preflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_user_organization_uuid')
    THEN RAISE EXCEPTION 'c2-9-10 preflight: get_user_organization_uuid() missing'; END IF;
  IF EXISTS (SELECT 1 FROM public.project_documents  WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-9-10: project_documents null uuid'; END IF;
  IF EXISTS (SELECT 1 FROM public.project_events     WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-9-10: project_events null uuid'; END IF;
  IF EXISTS (SELECT 1 FROM public.project_milestones WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-9-10: project_milestones null uuid'; END IF;
  IF EXISTS (SELECT 1 FROM public.schedules          WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-9-10: schedules null uuid'; END IF;
  IF EXISTS (SELECT 1 FROM public.plans              WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-9-10: plans null uuid'; END IF;
  IF EXISTS (SELECT 1 FROM public.work_packages      WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-9-10: work_packages null uuid'; END IF;
  IF EXISTS (SELECT 1 FROM public.org_team           WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-9-10: org_team null uuid'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_invitations   WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-9-10: user_invitations null uuid'; END IF;
  IF EXISTS (SELECT 1 FROM public.feedback           WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-9-10: feedback null uuid'; END IF;
  IF EXISTS (SELECT 1 FROM public.gameplan_playbook  WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-9-10: gameplan_playbook null uuid'; END IF;
  IF EXISTS (SELECT 1 FROM public.gameplan_plays     WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-9-10: gameplan_plays null uuid'; END IF;
END $preflight$;

-- ===== H26 drive-by: enable RLS on the 3 disabled tables =====
ALTER TABLE public.project_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_packages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_team       ENABLE ROW LEVEL SECURITY;

-- ===== C2-9 project meta =====

-- project_documents (4)
DROP POLICY IF EXISTS "Users can view documents in their organization"   ON public.project_documents;
CREATE POLICY "Users can view documents in their organization" ON public.project_documents
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can create documents in their organization" ON public.project_documents;
CREATE POLICY "Users can create documents in their organization" ON public.project_documents
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can update documents in their organization" ON public.project_documents;
CREATE POLICY "Users can update documents in their organization" ON public.project_documents
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can delete documents in their organization" ON public.project_documents;
CREATE POLICY "Users can delete documents in their organization" ON public.project_documents
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());

-- project_events (NEW: H26, model after schedules: 1 SELECT active + 1 FOR ALL editor)
DROP POLICY IF EXISTS "Users can view organization project events" ON public.project_events;
CREATE POLICY "Users can view organization project events" ON public.project_events
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());
DROP POLICY IF EXISTS "Editors and admins can manage project events" ON public.project_events;
CREATE POLICY "Editors and admins can manage project events" ON public.project_events
  FOR ALL USING (organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

-- project_milestones (4 — custom names)
DROP POLICY IF EXISTS milestones_select_by_org ON public.project_milestones;
CREATE POLICY milestones_select_by_org ON public.project_milestones
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS milestones_insert_by_org ON public.project_milestones;
CREATE POLICY milestones_insert_by_org ON public.project_milestones
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS milestones_update_by_org ON public.project_milestones;
CREATE POLICY milestones_update_by_org ON public.project_milestones
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid())
  WITH CHECK   (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS milestones_delete_by_org ON public.project_milestones;
CREATE POLICY milestones_delete_by_org ON public.project_milestones
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());

-- schedules (2)
DROP POLICY IF EXISTS "Users can view organization schedules" ON public.schedules;
CREATE POLICY "Users can view organization schedules" ON public.schedules
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());
DROP POLICY IF EXISTS "Editors and admins can manage schedules" ON public.schedules;
CREATE POLICY "Editors and admins can manage schedules" ON public.schedules
  FOR ALL USING (organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

-- plans (2)
DROP POLICY IF EXISTS "Users can view organization plans" ON public.plans;
CREATE POLICY "Users can view organization plans" ON public.plans
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());
DROP POLICY IF EXISTS "Editors and admins can manage plans" ON public.plans;
CREATE POLICY "Editors and admins can manage plans" ON public.plans
  FOR ALL USING (organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

-- work_packages (NEW: H26, model after plans)
DROP POLICY IF EXISTS "Users can view organization work packages" ON public.work_packages;
CREATE POLICY "Users can view organization work packages" ON public.work_packages
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());
DROP POLICY IF EXISTS "Editors and admins can manage work packages" ON public.work_packages;
CREATE POLICY "Editors and admins can manage work packages" ON public.work_packages
  FOR ALL USING (organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

-- ===== C2-10 infra/misc =====

-- org_team (NEW: H26, team listing — readable by all org members, admin manages)
DROP POLICY IF EXISTS "Users can view organization team" ON public.org_team;
CREATE POLICY "Users can view organization team" ON public.org_team
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());
DROP POLICY IF EXISTS "Admins can manage organization team" ON public.org_team;
CREATE POLICY "Admins can manage organization team" ON public.org_team
  FOR ALL USING (organization_id_uuid = public.get_user_organization_uuid() AND public.user_is_admin());

-- user_invitations (4)
DROP POLICY IF EXISTS "Admins can view invitations in their organization" ON public.user_invitations;
CREATE POLICY "Admins can view invitations in their organization" ON public.user_invitations
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.user_is_admin());
DROP POLICY IF EXISTS "Admins can create invitations" ON public.user_invitations;
CREATE POLICY "Admins can create invitations" ON public.user_invitations
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_is_admin());
DROP POLICY IF EXISTS "Admins can update invitations" ON public.user_invitations;
CREATE POLICY "Admins can update invitations" ON public.user_invitations
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_is_admin());
DROP POLICY IF EXISTS "Admins can delete invitations" ON public.user_invitations;
CREATE POLICY "Admins can delete invitations" ON public.user_invitations
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_is_admin());

-- feedback (4) — SELECT/INSERT any user; UPDATE/DELETE admin-only
DROP POLICY IF EXISTS "Users can view feedback in their organization" ON public.feedback;
CREATE POLICY "Users can view feedback in their organization" ON public.feedback
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can create feedback in their organization" ON public.feedback;
CREATE POLICY "Users can create feedback in their organization" ON public.feedback
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Admins can update feedback in their organization" ON public.feedback;
CREATE POLICY "Admins can update feedback in their organization" ON public.feedback
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_is_admin());
DROP POLICY IF EXISTS "Admins can delete feedback in their organization" ON public.feedback;
CREATE POLICY "Admins can delete feedback in their organization" ON public.feedback
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_is_admin());

-- gameplan_playbook (4)
DROP POLICY IF EXISTS "Users can view playbook in their organization"            ON public.gameplan_playbook;
CREATE POLICY "Users can view playbook in their organization" ON public.gameplan_playbook
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can insert playbook plays in their organization"    ON public.gameplan_playbook;
CREATE POLICY "Users can insert playbook plays in their organization" ON public.gameplan_playbook
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can update playbook plays in their organization"    ON public.gameplan_playbook;
CREATE POLICY "Users can update playbook plays in their organization" ON public.gameplan_playbook
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can delete playbook plays in their organization"    ON public.gameplan_playbook;
CREATE POLICY "Users can delete playbook plays in their organization" ON public.gameplan_playbook
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());

-- gameplan_plays (4)
DROP POLICY IF EXISTS "Users can view gameplan plays in their organization"      ON public.gameplan_plays;
CREATE POLICY "Users can view gameplan plays in their organization" ON public.gameplan_plays
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can insert gameplan plays in their organization"    ON public.gameplan_plays;
CREATE POLICY "Users can insert gameplan plays in their organization" ON public.gameplan_plays
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can update gameplan plays in their organization"    ON public.gameplan_plays;
CREATE POLICY "Users can update gameplan plays in their organization" ON public.gameplan_plays
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can delete gameplan plays in their organization"    ON public.gameplan_plays;
CREATE POLICY "Users can delete gameplan plays in their organization" ON public.gameplan_plays
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());

-- Post-apply
DO $postcheck$
DECLARE n int; rls boolean;
BEGIN
  -- Total policies: 4+2+4+2+2+2 (C2-9: 16) + 2+4+4+4+4 (C2-10: 18) = 34
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename IN (
    'project_documents','project_events','project_milestones','schedules','plans','work_packages',
    'org_team','user_invitations','feedback','gameplan_playbook','gameplan_plays'
  );
  IF n <> 34 THEN RAISE EXCEPTION 'c2-9-10 postcheck: expected 34 policies, got %', n; END IF;

  -- H26 RLS enable verification
  SELECT relrowsecurity INTO rls FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relname='project_events';
  IF rls IS NOT TRUE THEN RAISE EXCEPTION 'c2-9-10: project_events RLS not enabled'; END IF;
  SELECT relrowsecurity INTO rls FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relname='work_packages';
  IF rls IS NOT TRUE THEN RAISE EXCEPTION 'c2-9-10: work_packages RLS not enabled'; END IF;
  SELECT relrowsecurity INTO rls FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relname='org_team';
  IF rls IS NOT TRUE THEN RAISE EXCEPTION 'c2-9-10: org_team RLS not enabled'; END IF;

  -- No bare text refs
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('project_documents','project_events','project_milestones','schedules','plans','work_packages',
                       'org_team','user_invitations','feedback','gameplan_playbook','gameplan_plays')
     AND ((qual IS NOT NULL AND qual ~ 'organization_id[^_]')
          OR (with_check IS NOT NULL AND with_check ~ 'organization_id[^_]'));
  IF n > 0 THEN RAISE EXCEPTION 'c2-9-10 postcheck: % policies still reference text organization_id', n; END IF;
END $postcheck$;

COMMIT;

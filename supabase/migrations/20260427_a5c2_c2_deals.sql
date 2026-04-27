-- ============================================================
-- A5-c.2 chunk C2-2: deals subsystem UUID-based RLS policies
-- Tables: deals, deal_activity_events, deal_documents, deal_notes,
--         deal_proforma_versions, deal_workspace_context
-- ============================================================
-- Applies to both branch (clqgnnydrwpgxvipyotd) and prod (rvtdavpsvrhbktbxquzm).
-- Idempotent: DROP POLICY IF EXISTS handles both env's identical policy names.
-- See docs/A5C2_C2_DEALS.md and docs/A5_PLAN.md §10.
--
-- Scope:
--   24 policies (6 tables × 4 ops). Each currently filters on either:
--     - branch: organization_id_uuid IN (subquery from profiles)
--     - prod:   organization_id        IN (subquery from profiles)
--   This migration replaces all 24 with: organization_id_uuid = public.get_user_organization_uuid()
--   (matching the C2-1 helper-call pattern; helper is STABLE SECURITY DEFINER so it bypasses
--    the recursion problem and is cached within a query plan).
--
--   INSERT/UPDATE/DELETE add an explicit "organization_id_uuid IS NOT NULL" guard for
--   defense-in-depth; SELECT does not (NULL=NULL → NULL → falsy already blocks NULLs).
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
  ) THEN RAISE EXCEPTION 'c2-2 preflight: public.get_user_organization_uuid() missing'; END IF;

  IF EXISTS (SELECT 1 FROM public.deals                  WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-2 preflight: deals has NULL organization_id_uuid rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.deal_activity_events   WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-2 preflight: deal_activity_events has NULL organization_id_uuid rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.deal_documents         WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-2 preflight: deal_documents has NULL organization_id_uuid rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.deal_notes             WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-2 preflight: deal_notes has NULL organization_id_uuid rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.deal_proforma_versions WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-2 preflight: deal_proforma_versions has NULL organization_id_uuid rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.deal_workspace_context WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-2 preflight: deal_workspace_context has NULL organization_id_uuid rows'; END IF;
END
$preflight$;

-- ------------------------------------------------------------
-- 1. deals
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view deals in their organization"   ON public.deals;
CREATE POLICY "Users can view deals in their organization" ON public.deals
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid());

DROP POLICY IF EXISTS "Users can create deals in their organization" ON public.deals;
CREATE POLICY "Users can create deals in their organization" ON public.deals
  FOR INSERT WITH CHECK (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

DROP POLICY IF EXISTS "Users can update deals in their organization" ON public.deals;
CREATE POLICY "Users can update deals in their organization" ON public.deals
  FOR UPDATE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

DROP POLICY IF EXISTS "Users can delete deals in their organization" ON public.deals;
CREATE POLICY "Users can delete deals in their organization" ON public.deals
  FOR DELETE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

-- ------------------------------------------------------------
-- 2. deal_activity_events
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view deal activity events in organization"   ON public.deal_activity_events;
CREATE POLICY "Users can view deal activity events in organization" ON public.deal_activity_events
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid());

DROP POLICY IF EXISTS "Users can create deal activity events in organization" ON public.deal_activity_events;
CREATE POLICY "Users can create deal activity events in organization" ON public.deal_activity_events
  FOR INSERT WITH CHECK (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

DROP POLICY IF EXISTS "Users can update deal activity events in organization" ON public.deal_activity_events;
CREATE POLICY "Users can update deal activity events in organization" ON public.deal_activity_events
  FOR UPDATE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

DROP POLICY IF EXISTS "Users can delete deal activity events in organization" ON public.deal_activity_events;
CREATE POLICY "Users can delete deal activity events in organization" ON public.deal_activity_events
  FOR DELETE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

-- ------------------------------------------------------------
-- 3. deal_documents
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view deal documents in their organization"   ON public.deal_documents;
CREATE POLICY "Users can view deal documents in their organization" ON public.deal_documents
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid());

DROP POLICY IF EXISTS "Users can create deal documents in their organization" ON public.deal_documents;
CREATE POLICY "Users can create deal documents in their organization" ON public.deal_documents
  FOR INSERT WITH CHECK (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

DROP POLICY IF EXISTS "Users can update deal documents in their organization" ON public.deal_documents;
CREATE POLICY "Users can update deal documents in their organization" ON public.deal_documents
  FOR UPDATE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

DROP POLICY IF EXISTS "Users can delete deal documents in their organization" ON public.deal_documents;
CREATE POLICY "Users can delete deal documents in their organization" ON public.deal_documents
  FOR DELETE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

-- ------------------------------------------------------------
-- 4. deal_notes
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view deal notes in their organization"   ON public.deal_notes;
CREATE POLICY "Users can view deal notes in their organization" ON public.deal_notes
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid());

DROP POLICY IF EXISTS "Users can create deal notes in their organization" ON public.deal_notes;
CREATE POLICY "Users can create deal notes in their organization" ON public.deal_notes
  FOR INSERT WITH CHECK (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

DROP POLICY IF EXISTS "Users can update deal notes in their organization" ON public.deal_notes;
CREATE POLICY "Users can update deal notes in their organization" ON public.deal_notes
  FOR UPDATE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

DROP POLICY IF EXISTS "Users can delete deal notes in their organization" ON public.deal_notes;
CREATE POLICY "Users can delete deal notes in their organization" ON public.deal_notes
  FOR DELETE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

-- ------------------------------------------------------------
-- 5. deal_proforma_versions
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view deal proforma versions in their organization"   ON public.deal_proforma_versions;
CREATE POLICY "Users can view deal proforma versions in their organization" ON public.deal_proforma_versions
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid());

DROP POLICY IF EXISTS "Users can create deal proforma versions in their organization" ON public.deal_proforma_versions;
CREATE POLICY "Users can create deal proforma versions in their organization" ON public.deal_proforma_versions
  FOR INSERT WITH CHECK (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

DROP POLICY IF EXISTS "Users can update deal proforma versions in their organization" ON public.deal_proforma_versions;
CREATE POLICY "Users can update deal proforma versions in their organization" ON public.deal_proforma_versions
  FOR UPDATE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

DROP POLICY IF EXISTS "Users can delete deal proforma versions in their organization" ON public.deal_proforma_versions;
CREATE POLICY "Users can delete deal proforma versions in their organization" ON public.deal_proforma_versions
  FOR DELETE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

-- ------------------------------------------------------------
-- 6. deal_workspace_context
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view deal workspace context in organization"   ON public.deal_workspace_context;
CREATE POLICY "Users can view deal workspace context in organization" ON public.deal_workspace_context
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid());

DROP POLICY IF EXISTS "Users can create deal workspace context in organization" ON public.deal_workspace_context;
CREATE POLICY "Users can create deal workspace context in organization" ON public.deal_workspace_context
  FOR INSERT WITH CHECK (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

DROP POLICY IF EXISTS "Users can update deal workspace context in organization" ON public.deal_workspace_context;
CREATE POLICY "Users can update deal workspace context in organization" ON public.deal_workspace_context
  FOR UPDATE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

DROP POLICY IF EXISTS "Users can delete deal workspace context in organization" ON public.deal_workspace_context;
CREATE POLICY "Users can delete deal workspace context in organization" ON public.deal_workspace_context
  FOR DELETE USING (
    organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
  );

-- ------------------------------------------------------------
-- 7. Post-apply assertions
-- ------------------------------------------------------------
DO $postcheck$
DECLARE
  n int;
BEGIN
  -- Each of 6 tables should have exactly 4 policies = 24 total
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('deals','deal_activity_events','deal_documents','deal_notes','deal_proforma_versions','deal_workspace_context');
  IF n <> 24 THEN RAISE EXCEPTION 'c2-2 postcheck: deal subsystem has % policies, expected 24', n; END IF;

  -- No bare text-column references remain
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('deals','deal_activity_events','deal_documents','deal_notes','deal_proforma_versions','deal_workspace_context')
     AND (
       (qual       IS NOT NULL AND qual       ~ 'organization_id[^_]')
       OR
       (with_check IS NOT NULL AND with_check ~ 'organization_id[^_]')
     );
  IF n > 0 THEN RAISE EXCEPTION 'c2-2 postcheck: % deal-table policies still reference text organization_id', n; END IF;
END
$postcheck$;

COMMIT;

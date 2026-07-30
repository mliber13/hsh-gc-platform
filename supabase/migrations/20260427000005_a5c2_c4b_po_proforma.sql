-- ============================================================
-- A5-c.2 chunk C2-4b: po_headers, po_lines, proforma_inputs
-- ============================================================
-- The complex half of C2-4. These three tables use non-standard RLS patterns:
--
--   po_headers, po_lines:
--     - No organization_id column at all (org scope inherited from
--       projects via FK join). No bridge trigger (no column to bridge).
--     - All 4 policies use EXISTS (SELECT FROM projects WHERE ...) joining
--       through po_headers.project_id (or po_lines.po_id -> po_headers.project_id).
--
--   proforma_inputs:
--     - SELECT: org match + active + project-belongs-to-org (3-way).
--     - INSERT: auth.uid()=user_id AND org match AND user_can_edit() AND
--               project-belongs-to-org (4-way).
--     - UPDATE/DELETE: pure auth.uid()=user_id (owner-based; no org check).
--       These two policies don't reference organization_id at all and are
--       NOT touched by this migration — preserved as-is.
--
-- Applies to both branch (clqgnnydrwpgxvipyotd) and prod (rvtdavpsvrhbktbxquzm).
-- See docs/A5C2_C4B_PO_PROFORMA.md and A5_PLAN.md §10.
--
-- Scope: 10 policies rewritten (po_headers 4 + po_lines 4 + proforma_inputs 2).
-- proforma_inputs UPDATE/DELETE (2 policies) intentionally untouched.
-- Total policies on these 3 tables after migration: 12 (unchanged).
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
  ) THEN RAISE EXCEPTION 'c2-4b preflight: public.get_user_organization_uuid() missing'; END IF;

  -- po_headers / po_lines have NO organization_id column — only proforma_inputs has one to check.
  IF EXISTS (SELECT 1 FROM public.proforma_inputs WHERE organization_id_uuid IS NULL) THEN
    RAISE EXCEPTION 'c2-4b preflight: proforma_inputs has NULL organization_id_uuid rows';
  END IF;

  -- po_headers / po_lines inherit org via projects.organization_id_uuid;
  -- C2-1 already verified projects.organization_id_uuid is non-null and backfilled.
  IF EXISTS (SELECT 1 FROM public.projects WHERE organization_id_uuid IS NULL) THEN
    RAISE EXCEPTION 'c2-4b preflight: projects has NULL organization_id_uuid rows (would orphan po_headers / po_lines policies)';
  END IF;
END
$preflight$;

-- ------------------------------------------------------------
-- 1. po_headers  (4 policies; EXISTS-join through projects)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view PO for org projects" ON public.po_headers;
CREATE POLICY "Users can view PO for org projects" ON public.po_headers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = po_headers.project_id
        AND p.organization_id_uuid = public.get_user_organization_uuid()
        AND public.is_user_active()
    )
  );

DROP POLICY IF EXISTS "Users can insert PO for org projects" ON public.po_headers;
CREATE POLICY "Users can insert PO for org projects" ON public.po_headers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = po_headers.project_id
        AND p.organization_id_uuid = public.get_user_organization_uuid()
        AND public.user_can_edit()
    )
  );

DROP POLICY IF EXISTS "Users can update PO for org projects" ON public.po_headers;
CREATE POLICY "Users can update PO for org projects" ON public.po_headers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = po_headers.project_id
        AND p.organization_id_uuid = public.get_user_organization_uuid()
        AND public.user_can_edit()
    )
  );

DROP POLICY IF EXISTS "Users can delete PO for org projects" ON public.po_headers;
CREATE POLICY "Users can delete PO for org projects" ON public.po_headers
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = po_headers.project_id
        AND p.organization_id_uuid = public.get_user_organization_uuid()
        AND public.user_can_edit()
    )
  );

-- ------------------------------------------------------------
-- 2. po_lines  (4 policies; deeper EXISTS-join po_headers -> projects)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view PO lines when they can view the PO" ON public.po_lines;
CREATE POLICY "Users can view PO lines when they can view the PO" ON public.po_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.po_headers ph
      JOIN public.projects   p  ON p.id = ph.project_id
      WHERE ph.id = po_lines.po_id
        AND p.organization_id_uuid = public.get_user_organization_uuid()
        AND public.is_user_active()
    )
  );

DROP POLICY IF EXISTS "Users can insert PO lines when they can edit the PO" ON public.po_lines;
CREATE POLICY "Users can insert PO lines when they can edit the PO" ON public.po_lines
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.po_headers ph
      JOIN public.projects   p  ON p.id = ph.project_id
      WHERE ph.id = po_lines.po_id
        AND p.organization_id_uuid = public.get_user_organization_uuid()
        AND public.user_can_edit()
    )
  );

DROP POLICY IF EXISTS "Users can update PO lines when they can edit the PO" ON public.po_lines;
CREATE POLICY "Users can update PO lines when they can edit the PO" ON public.po_lines
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.po_headers ph
      JOIN public.projects   p  ON p.id = ph.project_id
      WHERE ph.id = po_lines.po_id
        AND p.organization_id_uuid = public.get_user_organization_uuid()
        AND public.user_can_edit()
    )
  );

DROP POLICY IF EXISTS "Users can delete PO lines when they can edit the PO" ON public.po_lines;
CREATE POLICY "Users can delete PO lines when they can edit the PO" ON public.po_lines
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.po_headers ph
      JOIN public.projects   p  ON p.id = ph.project_id
      WHERE ph.id = po_lines.po_id
        AND p.organization_id_uuid = public.get_user_organization_uuid()
        AND public.user_can_edit()
    )
  );

-- ------------------------------------------------------------
-- 3. proforma_inputs  (only SELECT and INSERT touched; UPDATE/DELETE preserved)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view proforma inputs in their organization" ON public.proforma_inputs;
CREATE POLICY "Users can view proforma inputs in their organization" ON public.proforma_inputs
  FOR SELECT USING (
    organization_id_uuid = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = proforma_inputs.project_id
        AND projects.organization_id_uuid = public.get_user_organization_uuid()
    )
  );

DROP POLICY IF EXISTS "Editors and admins can create proforma inputs" ON public.proforma_inputs;
CREATE POLICY "Editors and admins can create proforma inputs" ON public.proforma_inputs
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND organization_id_uuid IS NOT NULL
    AND organization_id_uuid = public.get_user_organization_uuid()
    AND public.user_can_edit()
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = proforma_inputs.project_id
        AND projects.organization_id_uuid = public.get_user_organization_uuid()
    )
  );

-- proforma_inputs UPDATE policy ("auth.uid() = user_id") and DELETE policy
-- ("auth.uid() = user_id") are NOT touched. They reference no organization_id
-- at all, so they remain correct and don't need rewriting.

-- ------------------------------------------------------------
-- 4. Post-apply assertions
-- ------------------------------------------------------------
DO $postcheck$
DECLARE
  n int;
BEGIN
  -- Total policies on the 3 tables: 4 + 4 + 4 = 12
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('po_headers','po_lines','proforma_inputs');
  IF n <> 12 THEN RAISE EXCEPTION 'c2-4b postcheck: combined policy count is %, expected 12', n; END IF;

  -- Per-table
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='po_headers';
  IF n <> 4 THEN RAISE EXCEPTION 'c2-4b postcheck: po_headers has % policies, expected 4', n; END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='po_lines';
  IF n <> 4 THEN RAISE EXCEPTION 'c2-4b postcheck: po_lines has % policies, expected 4', n; END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='proforma_inputs';
  IF n <> 4 THEN RAISE EXCEPTION 'c2-4b postcheck: proforma_inputs has % policies, expected 4', n; END IF;

  -- No bare text-column references remain anywhere on these 3 tables.
  -- (proforma_inputs UPDATE/DELETE use auth.uid()=user_id and have no
  --  organization_id reference, so the regex won't match them.)
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('po_headers','po_lines','proforma_inputs')
     AND (
       (qual       IS NOT NULL AND qual       ~ 'organization_id[^_]')
       OR
       (with_check IS NOT NULL AND with_check ~ 'organization_id[^_]')
     );
  IF n > 0 THEN RAISE EXCEPTION 'c2-4b postcheck: % policies still reference text organization_id', n; END IF;
END
$postcheck$;

COMMIT;

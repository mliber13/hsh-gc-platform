-- ============================================================
-- A5-c.2 chunk C2-5: labor / payroll subsystem
-- Tables: labor_entries, material_entries, subcontractor_entries, time_entries,
--         employee_classes, labor_burden_rates, labor_burden_recalibrations,
--         labor_import_batches, labor_import_errors, qbo_wage_allocation_config,
--         pay_periods
-- ============================================================
-- Applies to both branch (clqgnnydrwpgxvipyotd) and prod (rvtdavpsvrhbktbxquzm).
-- See docs/A5C2_C5_LABOR_PAYROLL.md and A5_PLAN.md §10.
--
-- Scope: 32 policies across 11 tables.
--
-- Pattern recombinations (all proven in C2-1 through C2-4b):
--   - Helper-call swap (organization_id_uuid = public.get_user_organization_uuid())
--   - FOR ALL preserved on tables with single management policy
--   - EXISTS-join for labor_import_errors (no own org column; inherits via labor_import_batches)
--   - Inline-subquery → helper-call for pay_periods
--
-- Pre-existing semantics preserved verbatim:
--   - labor_import_batches has only SELECT + INSERT (no UPDATE/DELETE) — immutable batch records
--   - labor_import_errors has only SELECT + INSERT — same reason
--   - time_entries previously used current_user_organization_id(); migration switches
--     to get_user_organization_uuid() for consistency with the rest of A5-c.2
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
  ) THEN RAISE EXCEPTION 'c2-5 preflight: public.get_user_organization_uuid() missing'; END IF;

  -- All 10 tables with their own organization_id_uuid must be backfilled (no NULLs).
  -- labor_import_errors has no own org column; it inherits via labor_import_batches.
  IF EXISTS (SELECT 1 FROM public.labor_entries               WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-5 preflight: labor_entries has NULL uuid rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.material_entries            WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-5 preflight: material_entries has NULL uuid rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.subcontractor_entries       WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-5 preflight: subcontractor_entries has NULL uuid rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.time_entries                WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-5 preflight: time_entries has NULL uuid rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.employee_classes            WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-5 preflight: employee_classes has NULL uuid rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.labor_burden_rates          WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-5 preflight: labor_burden_rates has NULL uuid rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.labor_burden_recalibrations WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-5 preflight: labor_burden_recalibrations has NULL uuid rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.labor_import_batches        WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-5 preflight: labor_import_batches has NULL uuid rows (would orphan labor_import_errors policies)'; END IF;
  IF EXISTS (SELECT 1 FROM public.qbo_wage_allocation_config  WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-5 preflight: qbo_wage_allocation_config has NULL uuid rows'; END IF;
  IF EXISTS (SELECT 1 FROM public.pay_periods                 WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-5 preflight: pay_periods has NULL uuid rows'; END IF;
END
$preflight$;

-- ------------------------------------------------------------
-- 1. labor_entries  (4 policies, separate, all editor-gated except SELECT)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view organization labor entries" ON public.labor_entries;
CREATE POLICY "Users can view organization labor entries" ON public.labor_entries
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());

DROP POLICY IF EXISTS "Editors and admins can create labor entries" ON public.labor_entries;
CREATE POLICY "Editors and admins can create labor entries" ON public.labor_entries
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

DROP POLICY IF EXISTS "Editors and admins can update labor entries" ON public.labor_entries;
CREATE POLICY "Editors and admins can update labor entries" ON public.labor_entries
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

DROP POLICY IF EXISTS "Editors and admins can delete labor entries" ON public.labor_entries;
CREATE POLICY "Editors and admins can delete labor entries" ON public.labor_entries
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

-- ------------------------------------------------------------
-- 2. material_entries  (4 policies, separate, editor-gated)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view organization material entries" ON public.material_entries;
CREATE POLICY "Users can view organization material entries" ON public.material_entries
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());

DROP POLICY IF EXISTS "Editors and admins can create material entries" ON public.material_entries;
CREATE POLICY "Editors and admins can create material entries" ON public.material_entries
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

DROP POLICY IF EXISTS "Editors and admins can update material entries" ON public.material_entries;
CREATE POLICY "Editors and admins can update material entries" ON public.material_entries
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

DROP POLICY IF EXISTS "Editors and admins can delete material entries" ON public.material_entries;
CREATE POLICY "Editors and admins can delete material entries" ON public.material_entries
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

-- ------------------------------------------------------------
-- 3. subcontractor_entries  (4 policies, separate, editor-gated)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view organization subcontractor entries" ON public.subcontractor_entries;
CREATE POLICY "Users can view organization subcontractor entries" ON public.subcontractor_entries
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());

DROP POLICY IF EXISTS "Editors and admins can create subcontractor entries" ON public.subcontractor_entries;
CREATE POLICY "Editors and admins can create subcontractor entries" ON public.subcontractor_entries
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

DROP POLICY IF EXISTS "Editors and admins can update subcontractor entries" ON public.subcontractor_entries;
CREATE POLICY "Editors and admins can update subcontractor entries" ON public.subcontractor_entries
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

DROP POLICY IF EXISTS "Editors and admins can delete subcontractor entries" ON public.subcontractor_entries;
CREATE POLICY "Editors and admins can delete subcontractor entries" ON public.subcontractor_entries
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

-- ------------------------------------------------------------
-- 4. time_entries  (4 policies; previously used current_user_organization_id() — switched to helper)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS time_entries_select_own_org ON public.time_entries;
CREATE POLICY time_entries_select_own_org ON public.time_entries
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid());

DROP POLICY IF EXISTS time_entries_insert_own_org ON public.time_entries;
CREATE POLICY time_entries_insert_own_org ON public.time_entries
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());

DROP POLICY IF EXISTS time_entries_update_own_org ON public.time_entries;
CREATE POLICY time_entries_update_own_org ON public.time_entries
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid())
  WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());

DROP POLICY IF EXISTS time_entries_delete_own_org ON public.time_entries;
CREATE POLICY time_entries_delete_own_org ON public.time_entries
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());

-- ------------------------------------------------------------
-- 5. employee_classes  (1 SELECT + 1 FOR ALL)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view org employee_classes" ON public.employee_classes;
CREATE POLICY "Users can view org employee_classes" ON public.employee_classes
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());

DROP POLICY IF EXISTS "Editors can manage org employee_classes" ON public.employee_classes;
CREATE POLICY "Editors can manage org employee_classes" ON public.employee_classes
  FOR ALL USING (organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

-- ------------------------------------------------------------
-- 6. labor_burden_rates  (1 SELECT + 1 FOR ALL)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view org labor_burden_rates" ON public.labor_burden_rates;
CREATE POLICY "Users can view org labor_burden_rates" ON public.labor_burden_rates
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());

DROP POLICY IF EXISTS "Editors can manage org labor_burden_rates" ON public.labor_burden_rates;
CREATE POLICY "Editors can manage org labor_burden_rates" ON public.labor_burden_rates
  FOR ALL USING (organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

-- ------------------------------------------------------------
-- 7. labor_burden_recalibrations  (1 SELECT + 1 FOR ALL)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view org labor_burden_recalibrations" ON public.labor_burden_recalibrations;
CREATE POLICY "Users can view org labor_burden_recalibrations" ON public.labor_burden_recalibrations
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());

DROP POLICY IF EXISTS "Editors can manage org labor_burden_recalibrations" ON public.labor_burden_recalibrations;
CREATE POLICY "Editors can manage org labor_burden_recalibrations" ON public.labor_burden_recalibrations
  FOR ALL USING (organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

-- ------------------------------------------------------------
-- 8. labor_import_batches  (only SELECT + INSERT — no UPDATE/DELETE; preserved verbatim)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view org labor_import_batches" ON public.labor_import_batches;
CREATE POLICY "Users can view org labor_import_batches" ON public.labor_import_batches
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());

DROP POLICY IF EXISTS "Editors can insert org labor_import_batches" ON public.labor_import_batches;
CREATE POLICY "Editors can insert org labor_import_batches" ON public.labor_import_batches
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

-- ------------------------------------------------------------
-- 9. labor_import_errors  (only SELECT + INSERT; EXISTS-join through labor_import_batches; no own org column)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view org labor_import_errors" ON public.labor_import_errors;
CREATE POLICY "Users can view org labor_import_errors" ON public.labor_import_errors
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.labor_import_batches b
      WHERE b.id = labor_import_errors.batch_id
        AND b.organization_id_uuid = public.get_user_organization_uuid()
        AND public.is_user_active()
    )
  );

DROP POLICY IF EXISTS "Editors can insert org labor_import_errors" ON public.labor_import_errors;
CREATE POLICY "Editors can insert org labor_import_errors" ON public.labor_import_errors
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.labor_import_batches b
      WHERE b.id = labor_import_errors.batch_id
        AND b.organization_id_uuid = public.get_user_organization_uuid()
        AND public.user_can_edit()
    )
  );

-- ------------------------------------------------------------
-- 10. qbo_wage_allocation_config  (1 SELECT + 1 FOR ALL)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view org qbo_wage_config" ON public.qbo_wage_allocation_config;
CREATE POLICY "Users can view org qbo_wage_config" ON public.qbo_wage_allocation_config
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());

DROP POLICY IF EXISTS "Editors can manage org qbo_wage_config" ON public.qbo_wage_allocation_config;
CREATE POLICY "Editors can manage org qbo_wage_config" ON public.qbo_wage_allocation_config
  FOR ALL USING (organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

-- ------------------------------------------------------------
-- 11. pay_periods  (4 policies; inline-subquery → helper-call swap; no role gating)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS pay_periods_org_select ON public.pay_periods;
CREATE POLICY pay_periods_org_select ON public.pay_periods
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid());

DROP POLICY IF EXISTS pay_periods_org_insert ON public.pay_periods;
CREATE POLICY pay_periods_org_insert ON public.pay_periods
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());

DROP POLICY IF EXISTS pay_periods_org_update ON public.pay_periods;
CREATE POLICY pay_periods_org_update ON public.pay_periods
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());

DROP POLICY IF EXISTS pay_periods_org_delete ON public.pay_periods;
CREATE POLICY pay_periods_org_delete ON public.pay_periods
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());

-- ------------------------------------------------------------
-- 12. Post-apply assertions
-- ------------------------------------------------------------
DO $postcheck$
DECLARE
  n int;
BEGIN
  -- Total: 32 policies across 11 tables
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('labor_entries','material_entries','subcontractor_entries','time_entries','employee_classes','labor_burden_rates','labor_burden_recalibrations','labor_import_batches','labor_import_errors','qbo_wage_allocation_config','pay_periods');
  IF n <> 32 THEN RAISE EXCEPTION 'c2-5 postcheck: combined policy count is %, expected 32', n; END IF;

  -- Per-table sanity
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='labor_entries';            IF n <> 4 THEN RAISE EXCEPTION 'c2-5 postcheck: labor_entries=%', n;            END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='material_entries';         IF n <> 4 THEN RAISE EXCEPTION 'c2-5 postcheck: material_entries=%', n;         END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='subcontractor_entries';    IF n <> 4 THEN RAISE EXCEPTION 'c2-5 postcheck: subcontractor_entries=%', n;    END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='time_entries';             IF n <> 4 THEN RAISE EXCEPTION 'c2-5 postcheck: time_entries=%', n;             END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='employee_classes';         IF n <> 2 THEN RAISE EXCEPTION 'c2-5 postcheck: employee_classes=%', n;         END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='labor_burden_rates';       IF n <> 2 THEN RAISE EXCEPTION 'c2-5 postcheck: labor_burden_rates=%', n;       END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='labor_burden_recalibrations'; IF n <> 2 THEN RAISE EXCEPTION 'c2-5 postcheck: labor_burden_recalibrations=%', n; END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='labor_import_batches';     IF n <> 2 THEN RAISE EXCEPTION 'c2-5 postcheck: labor_import_batches=%', n;     END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='labor_import_errors';      IF n <> 2 THEN RAISE EXCEPTION 'c2-5 postcheck: labor_import_errors=%', n;      END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='qbo_wage_allocation_config'; IF n <> 2 THEN RAISE EXCEPTION 'c2-5 postcheck: qbo_wage_allocation_config=%', n; END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='pay_periods';              IF n <> 4 THEN RAISE EXCEPTION 'c2-5 postcheck: pay_periods=%', n;              END IF;

  -- No bare text-column references remain
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('labor_entries','material_entries','subcontractor_entries','time_entries','employee_classes','labor_burden_rates','labor_burden_recalibrations','labor_import_batches','labor_import_errors','qbo_wage_allocation_config','pay_periods')
     AND (
       (qual       IS NOT NULL AND qual       ~ 'organization_id[^_]')
       OR
       (with_check IS NOT NULL AND with_check ~ 'organization_id[^_]')
     );
  IF n > 0 THEN RAISE EXCEPTION 'c2-5 postcheck: % policies still reference text organization_id', n; END IF;
END
$postcheck$;

COMMIT;

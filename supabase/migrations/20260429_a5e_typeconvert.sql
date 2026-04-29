-- ============================================================
-- A5-e: retire dual-column bridge pattern
-- ============================================================
-- Single-transaction migration that converges organization_id from
-- "text + scratch uuid" to "uuid only" on all 56 tenant-scoped tables.
-- After this commits: organization_id is uuid, no scratch column,
-- no bridge trigger, no text helpers, no organization_text_map,
-- and FK constraints to organizations(id) are in place.
--
-- ----------------------------------------------------------------
-- Why DROP+RENAME instead of ALTER TYPE
-- ----------------------------------------------------------------
-- The intuitive approach (ALTER COLUMN organization_id TYPE uuid
-- USING organization_id_uuid → DROP organization_id_uuid) FAILS
-- because every RLS policy from A5-c.2 references
-- organization_id_uuid by name. Postgres blocks the DROP COLUMN.
--
-- Workaround: drop the text column (which has no policy dependents
-- post-A5-c.2) and rename the uuid column to take its place.
-- Postgres tracks policy column references by attnum, not name —
-- after RENAME, all A5-c.2 policies still reference the same
-- attnum (now named organization_id) and continue working
-- without any explicit policy rewrite.
--
-- ----------------------------------------------------------------
-- Order of operations (single BEGIN/COMMIT — atomic rollback)
-- ----------------------------------------------------------------
--   0. Drop 18 storage.objects RLS policies that reference profiles.organization_id
--   1. Drop bridge triggers (53 × 2 = 106; profiles excluded from bridge)
--   2. Drop bridge_set_org_uuid + text helpers
--   3. Drop DEFAULT 'default-org' on tables that have it (~30)
--   4. DROP COLUMN organization_id (text) on 54 dual-column tables
--   5. RENAME organization_id_uuid → organization_id on those 54 tables
--   6. DROP COLUMN organization_id_uuid (scratch) on 2 already-uuid
--      tables (quote_requests, sow_templates)
--   7. Add NOT NULL on organization_id for 52 tenant-scoped tables
--      (skip profiles, trade_categories: nullable by design;
--      skip quote_requests, sow_templates: were originally nullable)
--   8. Drop organization_text_map
--   9. Replace handle_new_user (no scratch column reference)
--  9b. Update get_user_organization_uuid + current_user_organization_uuid
--      bodies to reference renamed column (Postgres doesn't auto-update
--      function body text on RENAME COLUMN — this would silently break
--      every RLS policy if missed)
--  10. Add FK to organizations(id) on all 56 tables
--  11. Recreate the 18 storage RLS policies with profiles.organization_id::text cast
--  12. Post-apply assertions
--
-- Storage migration is a separate Node script
-- (scripts/a5e-storage-migration.mjs) that runs BEFORE this SQL.
-- ============================================================

BEGIN;

-- ============================================================
-- 0. Drop storage.objects RLS policies that reference profiles.organization_id
-- ============================================================
-- 18 policies on storage.objects compare a path-prefix (text) against
-- profiles.organization_id (currently text). After step 4 drops that
-- column and step 5 renames the uuid column to take its place, the
-- policies would mismatch (text vs uuid). Drop them now, recreate at
-- step 11 with an explicit ::text cast on the uuid column.
--
-- Two patterns observed in production:
--   - IN-subquery (dd_*, pd_*, qa_*, qd_*): 14 policies
--   - EXISTS-with-equality (si_*): 4 policies
--
-- qa_public_select and qd_public_select don't reference profile org;
-- left untouched.
DROP POLICY IF EXISTS dd_auth_select_org ON storage.objects;
DROP POLICY IF EXISTS dd_auth_insert_org ON storage.objects;
DROP POLICY IF EXISTS dd_auth_update_org ON storage.objects;
DROP POLICY IF EXISTS dd_auth_delete_org ON storage.objects;
DROP POLICY IF EXISTS pd_auth_select_org ON storage.objects;
DROP POLICY IF EXISTS pd_auth_insert_org ON storage.objects;
DROP POLICY IF EXISTS pd_auth_update_org ON storage.objects;
DROP POLICY IF EXISTS pd_auth_delete_org ON storage.objects;
DROP POLICY IF EXISTS qa_auth_insert_org ON storage.objects;
DROP POLICY IF EXISTS qa_auth_update_org ON storage.objects;
DROP POLICY IF EXISTS qa_auth_delete_org ON storage.objects;
DROP POLICY IF EXISTS qd_auth_insert_org ON storage.objects;
DROP POLICY IF EXISTS qd_auth_update_org ON storage.objects;
DROP POLICY IF EXISTS qd_auth_delete_org ON storage.objects;
DROP POLICY IF EXISTS si_auth_select_org ON storage.objects;
DROP POLICY IF EXISTS si_auth_insert_org ON storage.objects;
DROP POLICY IF EXISTS si_auth_update_org ON storage.objects;
DROP POLICY IF EXISTS si_auth_delete_org ON storage.objects;

-- ============================================================
-- 1. Drop all bridge triggers
-- ============================================================
DO $bridge_triggers$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT event_object_table, trigger_name
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
      AND trigger_name LIKE '%bridge%'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I',
                   rec.trigger_name, rec.event_object_table);
  END LOOP;
END
$bridge_triggers$;

-- ============================================================
-- 2. Drop bridge function and text helpers
-- ============================================================
DROP FUNCTION IF EXISTS public.bridge_set_org_uuid();
DROP FUNCTION IF EXISTS public.get_user_organization();
DROP FUNCTION IF EXISTS public.current_user_organization_id();

-- ============================================================
-- 3. Drop DEFAULT 'default-org' from tables that have it
-- ============================================================
-- DEFAULT must be cleared before DROP COLUMN; otherwise the default
-- expression is evaluated on every existing row scan during the drop.
DO $drop_defaults$
DECLARE
  tbl text;
  tables_with_default text[] := ARRAY[
    'profiles',
    'projects', 'change_orders', 'contacts', 'deal_activity_events',
    'deal_workspace_context', 'developers', 'employee_classes',
    'estimate_templates', 'estimates', 'item_templates',
    'labor_burden_rates', 'labor_burden_recalibrations',
    'labor_entries', 'labor_import_batches', 'lenders',
    'material_entries', 'municipalities', 'pay_periods', 'plans',
    'proforma_inputs', 'project_actuals', 'project_proforma_versions',
    'qbo_wage_allocation_config', 'schedules',
    'selection_schedule_versions', 'subcontractor_entries',
    'subcontractors', 'suppliers', 'trade_categories', 'trades'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_with_default LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id DROP DEFAULT', tbl);
  END LOOP;
END
$drop_defaults$;

-- ============================================================
-- 4. Drop the text organization_id column (54 dual-column tables)
-- ============================================================
-- Post-A5-c.2 no RLS policy references the text column — they all
-- reference organization_id_uuid. So DROP COLUMN succeeds without
-- CASCADE (RESTRICT default catches surprises).
DO $drop_text$
DECLARE
  tbl text;
  dual_column_tables text[] := ARRAY[
    'change_orders', 'contacts', 'deal_activity_events', 'deal_documents',
    'deal_notes', 'deal_proforma_versions', 'deal_workspace_context',
    'deals', 'developers', 'employee_classes', 'estimate_templates',
    'estimates', 'feedback', 'form_responses', 'form_templates',
    'gameplan_playbook', 'gameplan_plays', 'item_templates',
    'labor_burden_rates', 'labor_burden_recalibrations', 'labor_entries',
    'labor_import_batches', 'lenders', 'material_entries', 'municipalities',
    'org_team', 'pay_periods', 'plans', 'profiles', 'proforma_inputs',
    'project_actuals', 'project_documents', 'project_events',
    'project_forms', 'project_milestones', 'project_proforma_versions',
    'projects', 'qbo_wage_allocation_config', 'schedules',
    'selection_books', 'selection_room_images',
    'selection_room_spec_sheets', 'selection_rooms',
    'selection_schedule_versions', 'sub_items', 'subcontractor_entries',
    'subcontractors', 'suppliers', 'tenant_pipeline_prospects',
    'time_entries', 'trade_categories', 'trades', 'user_invitations',
    'work_packages'
  ];
BEGIN
  FOREACH tbl IN ARRAY dual_column_tables LOOP
    EXECUTE format('ALTER TABLE public.%I DROP COLUMN organization_id', tbl);
  END LOOP;
END
$drop_text$;

-- ============================================================
-- 5. Rename organization_id_uuid → organization_id (54 tables)
-- ============================================================
-- After this step the renamed column takes the canonical name.
-- All A5-c.2 RLS policies that referenced the column by attnum
-- transparently update their displayed form to reference
-- organization_id without any policy rewrite.
DO $rename_uuid$
DECLARE
  tbl text;
  dual_column_tables text[] := ARRAY[
    'change_orders', 'contacts', 'deal_activity_events', 'deal_documents',
    'deal_notes', 'deal_proforma_versions', 'deal_workspace_context',
    'deals', 'developers', 'employee_classes', 'estimate_templates',
    'estimates', 'feedback', 'form_responses', 'form_templates',
    'gameplan_playbook', 'gameplan_plays', 'item_templates',
    'labor_burden_rates', 'labor_burden_recalibrations', 'labor_entries',
    'labor_import_batches', 'lenders', 'material_entries', 'municipalities',
    'org_team', 'pay_periods', 'plans', 'profiles', 'proforma_inputs',
    'project_actuals', 'project_documents', 'project_events',
    'project_forms', 'project_milestones', 'project_proforma_versions',
    'projects', 'qbo_wage_allocation_config', 'schedules',
    'selection_books', 'selection_room_images',
    'selection_room_spec_sheets', 'selection_rooms',
    'selection_schedule_versions', 'sub_items', 'subcontractor_entries',
    'subcontractors', 'suppliers', 'tenant_pipeline_prospects',
    'time_entries', 'trade_categories', 'trades', 'user_invitations',
    'work_packages'
  ];
BEGIN
  FOREACH tbl IN ARRAY dual_column_tables LOOP
    EXECUTE format('ALTER TABLE public.%I RENAME COLUMN organization_id_uuid TO organization_id', tbl);
  END LOOP;
END
$rename_uuid$;

-- ============================================================
-- 6. Drop scratch column on already-uuid tables (2)
-- ============================================================
-- quote_requests + sow_templates have organization_id (uuid) as their
-- canonical column from the original schema. They also gained an
-- organization_id_uuid scratch column in A5-a (redundant). Drop it.
-- No RLS policies reference the scratch column on these 2 tables
-- (their policies use organization_id directly), so DROP succeeds.
ALTER TABLE public.quote_requests DROP COLUMN IF EXISTS organization_id_uuid;
ALTER TABLE public.sow_templates  DROP COLUMN IF EXISTS organization_id_uuid;

-- ============================================================
-- 7. Add NOT NULL on organization_id where business semantics require it
-- ============================================================
-- Skip:
--   - profiles: nullable to support invite-first users (A5-c Path H)
--   - trade_categories: nullable to support system/shared rows (A5-c.2 C2-1)
--   - quote_requests, sow_templates: original schema had nullable uuid
DO $add_not_null$
DECLARE
  tbl text;
  not_null_tables text[] := ARRAY[
    'change_orders', 'contacts', 'deal_activity_events', 'deal_documents',
    'deal_notes', 'deal_proforma_versions', 'deal_workspace_context',
    'deals', 'developers', 'employee_classes', 'estimate_templates',
    'estimates', 'feedback', 'form_responses', 'form_templates',
    'gameplan_playbook', 'gameplan_plays', 'item_templates',
    'labor_burden_rates', 'labor_burden_recalibrations', 'labor_entries',
    'labor_import_batches', 'lenders', 'material_entries', 'municipalities',
    'org_team', 'pay_periods', 'plans', 'proforma_inputs',
    'project_actuals', 'project_documents', 'project_events',
    'project_forms', 'project_milestones', 'project_proforma_versions',
    'projects', 'qbo_wage_allocation_config', 'schedules',
    'selection_books', 'selection_room_images',
    'selection_room_spec_sheets', 'selection_rooms',
    'selection_schedule_versions', 'sub_items', 'subcontractor_entries',
    'subcontractors', 'suppliers', 'tenant_pipeline_prospects',
    'time_entries', 'trades', 'user_invitations',
    'work_packages'
  ];
BEGIN
  FOREACH tbl IN ARRAY not_null_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL', tbl);
  END LOOP;
END
$add_not_null$;

-- ============================================================
-- 8. Drop organization_text_map
-- ============================================================
DROP TABLE IF EXISTS public.organization_text_map;

-- ============================================================
-- 9. Replace handle_new_user (no scratch column reference)
-- ============================================================
-- Inserts NULL organization_id for new auth signups (invite-first model).
-- Profile.organization_id is now uuid (post-rename), so NULL fits.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, organization_id, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NULL,         -- uuid NULL = invite-first user; admin assigns org via invite flow
    'viewer',
    true
  );
  RETURN NEW;
END;
$function$;

-- ============================================================
-- 9b. Update helper function bodies to reference renamed column
-- ============================================================
-- Postgres stores function bodies as text strings and does NOT auto-update
-- column references on RENAME. The two helpers below were created in
-- A5-c.2 with body referencing organization_id_uuid (the scratch column,
-- now renamed to organization_id). Their bodies must be rewritten or
-- they would query a non-existent column and return NULL — silently
-- locking out every authenticated user who relies on RLS policies that
-- call get_user_organization_uuid() (which is essentially all of A5-c.2).
--
-- Caller signature is unchanged: still RETURNS uuid, still SECURITY
-- DEFINER STABLE.
CREATE OR REPLACE FUNCTION public.get_user_organization_uuid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.current_user_organization_uuid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$function$;

-- ============================================================
-- 10. Add FK to organizations(id) on all 56 tenant-scoped tables
-- ============================================================
-- profiles.organization_id is nullable (invite-first); FK allows NULL.
-- trade_categories.organization_id is nullable (system rows); FK allows NULL.
-- All other tables: NOT NULL set in step 7.
DO $add_fks$
DECLARE
  tbl text;
  fk_name text;
  fk_tables text[] := ARRAY[
    -- All 56 tenant-scoped tables (54 dual-column + 2 already-uuid)
    'change_orders', 'contacts', 'deal_activity_events', 'deal_documents',
    'deal_notes', 'deal_proforma_versions', 'deal_workspace_context',
    'deals', 'developers', 'employee_classes', 'estimate_templates',
    'estimates', 'feedback', 'form_responses', 'form_templates',
    'gameplan_playbook', 'gameplan_plays', 'item_templates',
    'labor_burden_rates', 'labor_burden_recalibrations', 'labor_entries',
    'labor_import_batches', 'lenders', 'material_entries', 'municipalities',
    'org_team', 'pay_periods', 'plans', 'profiles', 'proforma_inputs',
    'project_actuals', 'project_documents', 'project_events',
    'project_forms', 'project_milestones', 'project_proforma_versions',
    'projects', 'qbo_wage_allocation_config', 'schedules',
    'selection_books', 'selection_room_images',
    'selection_room_spec_sheets', 'selection_rooms',
    'selection_schedule_versions', 'sub_items', 'subcontractor_entries',
    'subcontractors', 'suppliers', 'tenant_pipeline_prospects',
    'time_entries', 'trade_categories', 'trades', 'user_invitations',
    'work_packages',
    'quote_requests', 'sow_templates'
  ];
BEGIN
  FOREACH tbl IN ARRAY fk_tables LOOP
    fk_name := tbl || '_organization_id_fkey';
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', tbl, fk_name);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (organization_id) REFERENCES public.organizations(id)',
      tbl, fk_name
    );
  END LOOP;
END
$add_fks$;

-- ============================================================
-- 11. Recreate the 18 storage RLS policies with ::text cast on the uuid column
-- ============================================================
-- Mirrors the original policies dropped in step 0, with profiles.organization_id
-- now uuid-typed. The cast lets us compare text path-prefix to uuid org_id.

-- ---- deal-documents (dd_*) — 4 policies, IN-subquery pattern ----
CREATE POLICY dd_auth_select_org ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'deal-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
  )
);
CREATE POLICY dd_auth_insert_org ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'deal-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
  )
);
CREATE POLICY dd_auth_update_org ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'deal-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'deal-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
  )
);
CREATE POLICY dd_auth_delete_org ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'deal-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
  )
);

-- ---- project-documents (pd_*) — 4 policies, IN-subquery pattern ----
CREATE POLICY pd_auth_select_org ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'project-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
  )
);
CREATE POLICY pd_auth_insert_org ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'project-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
  )
);
CREATE POLICY pd_auth_update_org ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'project-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'project-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
  )
);
CREATE POLICY pd_auth_delete_org ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'project-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
  )
);

-- ---- quote-attachments (qa_*) — 3 policies (SELECT handled by qa_public_select) ----
CREATE POLICY qa_auth_insert_org ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'quote-attachments'
  AND (storage.foldername(name))[1] IN (
    SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
  )
);
CREATE POLICY qa_auth_update_org ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'quote-attachments'
  AND (storage.foldername(name))[1] IN (
    SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'quote-attachments'
  AND (storage.foldername(name))[1] IN (
    SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
  )
);
CREATE POLICY qa_auth_delete_org ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'quote-attachments'
  AND (storage.foldername(name))[1] IN (
    SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
  )
);

-- ---- quote-documents (qd_*) — 3 policies (SELECT handled by qd_public_select) ----
CREATE POLICY qd_auth_insert_org ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'quote-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
  )
);
CREATE POLICY qd_auth_update_org ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'quote-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'quote-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
  )
);
CREATE POLICY qd_auth_delete_org ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'quote-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
  )
);

-- ---- selection-images (si_*) — 4 policies, EXISTS-with-equality pattern ----
CREATE POLICY si_auth_select_org ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'selection-images'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.organization_id::text = (storage.foldername(objects.name))[1]
  )
);
CREATE POLICY si_auth_insert_org ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'selection-images'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.organization_id::text = (storage.foldername(objects.name))[1]
  )
);
CREATE POLICY si_auth_update_org ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'selection-images'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.organization_id::text = (storage.foldername(objects.name))[1]
  )
)
WITH CHECK (
  bucket_id = 'selection-images'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.organization_id::text = (storage.foldername(objects.name))[1]
  )
);
CREATE POLICY si_auth_delete_org ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'selection-images'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.organization_id::text = (storage.foldername(objects.name))[1]
  )
);

-- ============================================================
-- 12. Post-apply assertions
-- ============================================================
DO $postcheck$
DECLARE
  n int;
BEGIN
  -- 12.1 organization_id is uuid type on every public table that has the column
  SELECT count(*) INTO n
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name = 'organization_id'
    AND data_type <> 'uuid';
  IF n > 0 THEN RAISE EXCEPTION 'a5e postcheck: % tables still have non-uuid organization_id', n; END IF;

  -- 12.2 No organization_id_uuid scratch column remains
  SELECT count(*) INTO n
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name = 'organization_id_uuid';
  IF n > 0 THEN RAISE EXCEPTION 'a5e postcheck: % tables still have organization_id_uuid scratch column', n; END IF;

  -- 12.3 Bridge function dropped
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
             WHERE ns.nspname='public' AND p.proname='bridge_set_org_uuid') THEN
    RAISE EXCEPTION 'a5e postcheck: bridge_set_org_uuid function still exists';
  END IF;

  -- 12.4 Text helpers dropped
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
             WHERE ns.nspname='public' AND p.proname='get_user_organization') THEN
    RAISE EXCEPTION 'a5e postcheck: get_user_organization (text) still exists';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
             WHERE ns.nspname='public' AND p.proname='current_user_organization_id') THEN
    RAISE EXCEPTION 'a5e postcheck: current_user_organization_id (text) still exists';
  END IF;

  -- 12.5 organization_text_map dropped
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='organization_text_map') THEN
    RAISE EXCEPTION 'a5e postcheck: organization_text_map table still exists';
  END IF;

  -- 12.6 All bridge triggers gone
  SELECT count(*) INTO n FROM information_schema.triggers
  WHERE trigger_schema='public' AND trigger_name LIKE '%bridge%';
  IF n > 0 THEN RAISE EXCEPTION 'a5e postcheck: % bridge triggers still attached', n; END IF;

  -- 12.7 Exactly 56 FK constraints to organizations(id)
  SELECT count(*) INTO n
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
   AND tc.table_schema = ccu.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND ccu.table_name = 'organizations'
    AND ccu.column_name = 'id';
  IF n <> 56 THEN RAISE EXCEPTION 'a5e postcheck: expected 56 FKs to organizations(id), got %', n; END IF;

  -- 12.8 Every non-null profile.organization_id references a real organizations row.
  -- (FK in step 10 already enforces; belt-and-suspenders.)
  SELECT count(*) INTO n FROM public.profiles p
  WHERE p.organization_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = p.organization_id);
  IF n > 0 THEN RAISE EXCEPTION 'a5e postcheck: % profiles reference non-existent organization', n; END IF;

  -- 12.9 trade_categories should still have system rows (NULL organization_id)
  SELECT count(*) INTO n FROM public.trade_categories WHERE organization_id IS NULL;
  IF n = 0 THEN RAISE EXCEPTION 'a5e postcheck: trade_categories has no system rows (NULL org_id) — backfill issue?'; END IF;

  -- 12.10 handle_new_user no longer references organization_id_uuid
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname='public' AND p.proname='handle_new_user'
      AND pg_get_functiondef(p.oid) LIKE '%organization_id_uuid%'
  ) THEN RAISE EXCEPTION 'a5e postcheck: handle_new_user still references organization_id_uuid'; END IF;

  -- 12.11 All 18 storage RLS policies recreated with the ::text cast
  SELECT count(*) INTO n
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname IN (
      'dd_auth_select_org','dd_auth_insert_org','dd_auth_update_org','dd_auth_delete_org',
      'pd_auth_select_org','pd_auth_insert_org','pd_auth_update_org','pd_auth_delete_org',
      'qa_auth_insert_org','qa_auth_update_org','qa_auth_delete_org',
      'qd_auth_insert_org','qd_auth_update_org','qd_auth_delete_org',
      'si_auth_select_org','si_auth_insert_org','si_auth_update_org','si_auth_delete_org'
    );
  IF n <> 18 THEN RAISE EXCEPTION 'a5e postcheck: expected 18 recreated storage RLS policies, got %', n; END IF;

  -- 12.12 Helper function bodies must reference the renamed column.
  -- Postgres doesn't auto-rewrite function bodies on RENAME COLUMN;
  -- if either function still references organization_id_uuid, every
  -- RLS policy depending on get_user_organization_uuid() would silently
  -- return NULL and lock out users.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname='public'
      AND p.proname IN ('get_user_organization_uuid','current_user_organization_uuid')
      AND pg_get_functiondef(p.oid) LIKE '%organization_id_uuid%'
  ) THEN RAISE EXCEPTION 'a5e postcheck: a helper function still references organization_id_uuid'; END IF;
END
$postcheck$;

COMMIT;

-- ============================================================
-- A5-c.2 chunks C2-7 + C2-8 (combined): selections + directory subsystems
-- 12 tables, 48 policies, all standard helper-call pattern.
-- ============================================================

BEGIN;

DO $preflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_user_organization_uuid')
    THEN RAISE EXCEPTION 'c2-7-8 preflight: get_user_organization_uuid() missing'; END IF;
  IF EXISTS (SELECT 1 FROM public.selection_books             WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-7-8: selection_books null uuid'; END IF;
  IF EXISTS (SELECT 1 FROM public.selection_rooms             WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-7-8: selection_rooms null uuid'; END IF;
  IF EXISTS (SELECT 1 FROM public.selection_room_images       WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-7-8: selection_room_images null uuid'; END IF;
  IF EXISTS (SELECT 1 FROM public.selection_room_spec_sheets  WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-7-8: selection_room_spec_sheets null uuid'; END IF;
  IF EXISTS (SELECT 1 FROM public.selection_schedule_versions WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-7-8: selection_schedule_versions null uuid'; END IF;
  IF EXISTS (SELECT 1 FROM public.contacts                    WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-7-8: contacts null uuid'; END IF;
  IF EXISTS (SELECT 1 FROM public.subcontractors              WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-7-8: subcontractors null uuid'; END IF;
  IF EXISTS (SELECT 1 FROM public.suppliers                   WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-7-8: suppliers null uuid'; END IF;
  IF EXISTS (SELECT 1 FROM public.developers                  WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-7-8: developers null uuid'; END IF;
  IF EXISTS (SELECT 1 FROM public.municipalities              WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-7-8: municipalities null uuid'; END IF;
  IF EXISTS (SELECT 1 FROM public.lenders                     WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-7-8: lenders null uuid'; END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_pipeline_prospects   WHERE organization_id_uuid IS NULL) THEN RAISE EXCEPTION 'c2-7-8: tenant_pipeline_prospects null uuid'; END IF;
END $preflight$;

-- ===== C2-7 selections (5 tables × 4 policies = 20) =====
-- selection_books
DROP POLICY IF EXISTS "Users can view selection books in their organization"   ON public.selection_books;
CREATE POLICY "Users can view selection books in their organization" ON public.selection_books
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can create selection books in their organization" ON public.selection_books;
CREATE POLICY "Users can create selection books in their organization" ON public.selection_books
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can update selection books in their organization" ON public.selection_books;
CREATE POLICY "Users can update selection books in their organization" ON public.selection_books
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can delete selection books in their organization" ON public.selection_books;
CREATE POLICY "Users can delete selection books in their organization" ON public.selection_books
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());

-- selection_rooms
DROP POLICY IF EXISTS "Users can view selection rooms in their organization"   ON public.selection_rooms;
CREATE POLICY "Users can view selection rooms in their organization" ON public.selection_rooms
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can create selection rooms in their organization" ON public.selection_rooms;
CREATE POLICY "Users can create selection rooms in their organization" ON public.selection_rooms
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can update selection rooms in their organization" ON public.selection_rooms;
CREATE POLICY "Users can update selection rooms in their organization" ON public.selection_rooms
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can delete selection rooms in their organization" ON public.selection_rooms;
CREATE POLICY "Users can delete selection rooms in their organization" ON public.selection_rooms
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());

-- selection_room_images
DROP POLICY IF EXISTS "Users can view selection room images in their organization"   ON public.selection_room_images;
CREATE POLICY "Users can view selection room images in their organization" ON public.selection_room_images
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can create selection room images in their organization" ON public.selection_room_images;
CREATE POLICY "Users can create selection room images in their organization" ON public.selection_room_images
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can update selection room images in their organization" ON public.selection_room_images;
CREATE POLICY "Users can update selection room images in their organization" ON public.selection_room_images
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can delete selection room images in their organization" ON public.selection_room_images;
CREATE POLICY "Users can delete selection room images in their organization" ON public.selection_room_images
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());

-- selection_room_spec_sheets
DROP POLICY IF EXISTS "Users can view spec sheets in their organization"   ON public.selection_room_spec_sheets;
CREATE POLICY "Users can view spec sheets in their organization" ON public.selection_room_spec_sheets
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can create spec sheets in their organization" ON public.selection_room_spec_sheets;
CREATE POLICY "Users can create spec sheets in their organization" ON public.selection_room_spec_sheets
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can update spec sheets in their organization" ON public.selection_room_spec_sheets;
CREATE POLICY "Users can update spec sheets in their organization" ON public.selection_room_spec_sheets
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can delete spec sheets in their organization" ON public.selection_room_spec_sheets;
CREATE POLICY "Users can delete spec sheets in their organization" ON public.selection_room_spec_sheets
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());

-- selection_schedule_versions
DROP POLICY IF EXISTS "Users can view selection schedules in organization"   ON public.selection_schedule_versions;
CREATE POLICY "Users can view selection schedules in organization" ON public.selection_schedule_versions
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can create selection schedules in organization" ON public.selection_schedule_versions;
CREATE POLICY "Users can create selection schedules in organization" ON public.selection_schedule_versions
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can update selection schedules in organization" ON public.selection_schedule_versions;
CREATE POLICY "Users can update selection schedules in organization" ON public.selection_schedule_versions
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());
DROP POLICY IF EXISTS "Users can delete selection schedules in organization" ON public.selection_schedule_versions;
CREATE POLICY "Users can delete selection schedules in organization" ON public.selection_schedule_versions
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid());

-- ===== C2-8 directory (7 tables × 4 policies = 28) =====
-- contacts
DROP POLICY IF EXISTS "Users can view organization contacts"   ON public.contacts;
CREATE POLICY "Users can view organization contacts" ON public.contacts
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());
DROP POLICY IF EXISTS "Users can insert organization contacts" ON public.contacts;
CREATE POLICY "Users can insert organization contacts" ON public.contacts
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());
DROP POLICY IF EXISTS "Users can update organization contacts" ON public.contacts;
CREATE POLICY "Users can update organization contacts" ON public.contacts
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit())
  WITH CHECK   (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());
DROP POLICY IF EXISTS "Users can delete organization contacts" ON public.contacts;
CREATE POLICY "Users can delete organization contacts" ON public.contacts
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

-- subcontractors
DROP POLICY IF EXISTS "Users can view organization subcontractors"   ON public.subcontractors;
CREATE POLICY "Users can view organization subcontractors" ON public.subcontractors
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());
DROP POLICY IF EXISTS "Users can insert organization subcontractors" ON public.subcontractors;
CREATE POLICY "Users can insert organization subcontractors" ON public.subcontractors
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());
DROP POLICY IF EXISTS "Users can update organization subcontractors" ON public.subcontractors;
CREATE POLICY "Users can update organization subcontractors" ON public.subcontractors
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit())
  WITH CHECK   (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());
DROP POLICY IF EXISTS "Users can delete organization subcontractors" ON public.subcontractors;
CREATE POLICY "Users can delete organization subcontractors" ON public.subcontractors
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

-- suppliers
DROP POLICY IF EXISTS "Users can view organization suppliers"   ON public.suppliers;
CREATE POLICY "Users can view organization suppliers" ON public.suppliers
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());
DROP POLICY IF EXISTS "Users can insert organization suppliers" ON public.suppliers;
CREATE POLICY "Users can insert organization suppliers" ON public.suppliers
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());
DROP POLICY IF EXISTS "Users can update organization suppliers" ON public.suppliers;
CREATE POLICY "Users can update organization suppliers" ON public.suppliers
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit())
  WITH CHECK   (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());
DROP POLICY IF EXISTS "Users can delete organization suppliers" ON public.suppliers;
CREATE POLICY "Users can delete organization suppliers" ON public.suppliers
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

-- developers
DROP POLICY IF EXISTS "Users can view organization developers"   ON public.developers;
CREATE POLICY "Users can view organization developers" ON public.developers
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());
DROP POLICY IF EXISTS "Users can insert organization developers" ON public.developers;
CREATE POLICY "Users can insert organization developers" ON public.developers
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());
DROP POLICY IF EXISTS "Users can update organization developers" ON public.developers;
CREATE POLICY "Users can update organization developers" ON public.developers
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit())
  WITH CHECK   (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());
DROP POLICY IF EXISTS "Users can delete organization developers" ON public.developers;
CREATE POLICY "Users can delete organization developers" ON public.developers
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

-- municipalities
DROP POLICY IF EXISTS "Users can view organization municipalities"   ON public.municipalities;
CREATE POLICY "Users can view organization municipalities" ON public.municipalities
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());
DROP POLICY IF EXISTS "Users can insert organization municipalities" ON public.municipalities;
CREATE POLICY "Users can insert organization municipalities" ON public.municipalities
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());
DROP POLICY IF EXISTS "Users can update organization municipalities" ON public.municipalities;
CREATE POLICY "Users can update organization municipalities" ON public.municipalities
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit())
  WITH CHECK   (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());
DROP POLICY IF EXISTS "Users can delete organization municipalities" ON public.municipalities;
CREATE POLICY "Users can delete organization municipalities" ON public.municipalities
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

-- lenders
DROP POLICY IF EXISTS "Users can view organization lenders"   ON public.lenders;
CREATE POLICY "Users can view organization lenders" ON public.lenders
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());
DROP POLICY IF EXISTS "Users can insert organization lenders" ON public.lenders;
CREATE POLICY "Users can insert organization lenders" ON public.lenders
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());
DROP POLICY IF EXISTS "Users can update organization lenders" ON public.lenders;
CREATE POLICY "Users can update organization lenders" ON public.lenders
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit())
  WITH CHECK   (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());
DROP POLICY IF EXISTS "Users can delete organization lenders" ON public.lenders;
CREATE POLICY "Users can delete organization lenders" ON public.lenders
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.user_can_edit());

-- tenant_pipeline_prospects (uses is_user_active everywhere instead of user_can_edit)
DROP POLICY IF EXISTS "Users can view tenant pipeline prospects"            ON public.tenant_pipeline_prospects;
CREATE POLICY "Users can view tenant pipeline prospects" ON public.tenant_pipeline_prospects
  FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());
DROP POLICY IF EXISTS "Active users can create tenant pipeline prospects"   ON public.tenant_pipeline_prospects;
CREATE POLICY "Active users can create tenant pipeline prospects" ON public.tenant_pipeline_prospects
  FOR INSERT WITH CHECK (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());
DROP POLICY IF EXISTS "Active users can update tenant pipeline prospects"   ON public.tenant_pipeline_prospects;
CREATE POLICY "Active users can update tenant pipeline prospects" ON public.tenant_pipeline_prospects
  FOR UPDATE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active())
  WITH CHECK   (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());
DROP POLICY IF EXISTS "Active users can delete tenant pipeline prospects"   ON public.tenant_pipeline_prospects;
CREATE POLICY "Active users can delete tenant pipeline prospects" ON public.tenant_pipeline_prospects
  FOR DELETE USING (organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid() AND public.is_user_active());

-- Post-apply
DO $postcheck$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename IN (
    'selection_books','selection_rooms','selection_room_images','selection_room_spec_sheets','selection_schedule_versions',
    'contacts','subcontractors','suppliers','developers','municipalities','lenders','tenant_pipeline_prospects'
  );
  IF n <> 48 THEN RAISE EXCEPTION 'c2-7-8 postcheck: expected 48 policies, got %', n; END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('selection_books','selection_rooms','selection_room_images','selection_room_spec_sheets','selection_schedule_versions',
                       'contacts','subcontractors','suppliers','developers','municipalities','lenders','tenant_pipeline_prospects')
     AND ((qual IS NOT NULL AND qual ~ 'organization_id[^_]')
          OR (with_check IS NOT NULL AND with_check ~ 'organization_id[^_]'));
  IF n > 0 THEN RAISE EXCEPTION 'c2-7-8 postcheck: % policies still reference text organization_id', n; END IF;
END $postcheck$;

COMMIT;

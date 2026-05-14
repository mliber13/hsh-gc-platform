-- Convert contact_categories.organization_id text → uuid (remote already applied TEXT variant)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'contact_categories'
      AND column_name = 'organization_id'
      AND data_type = 'text'
  ) THEN
    DROP POLICY IF EXISTS "Users can view organization contact_categories" ON contact_categories;
    DROP POLICY IF EXISTS "Users can insert organization contact_categories" ON contact_categories;
    DROP POLICY IF EXISTS "Users can update organization contact_categories" ON contact_categories;
    DROP POLICY IF EXISTS "Users can delete organization contact_categories" ON contact_categories;

    ALTER TABLE contact_categories
      ALTER COLUMN organization_id TYPE uuid USING organization_id::uuid;

    ALTER TABLE contact_categories
      ADD CONSTRAINT contact_categories_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

    CREATE POLICY "Users can view organization contact_categories"
      ON contact_categories FOR SELECT
      USING (
        organization_id = public.get_user_organization_uuid()
        AND public.is_user_active()
      );

    CREATE POLICY "Users can insert organization contact_categories"
      ON contact_categories FOR INSERT
      WITH CHECK (
        organization_id = public.get_user_organization_uuid()
        AND public.user_can_edit()
      );

    CREATE POLICY "Users can update organization contact_categories"
      ON contact_categories FOR UPDATE
      USING (
        organization_id = public.get_user_organization_uuid()
        AND public.user_can_edit()
      )
      WITH CHECK (
        organization_id = public.get_user_organization_uuid()
        AND public.user_can_edit()
      );

    CREATE POLICY "Users can delete organization contact_categories"
      ON contact_categories FOR DELETE
      USING (
        organization_id = public.get_user_organization_uuid()
        AND public.user_can_edit()
      );
  END IF;
END $$;

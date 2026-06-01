-- ============================================================================
-- Phase D: drywall-field-photos storage bucket + RLS
-- Path convention: {org_id}/{project_id}/{filename}
-- ============================================================================
--
-- PREVIEW (run in SQL editor to inspect; full DDL below is what apply_migration executes)
--   • Bucket: drywall-field-photos (private, 10MB, images only)
--   • SELECT: owner, office_gc, office_drywall, viewer — same org folder
--   • INSERT/DELETE: owner, office_gc, office_drywall — same org folder
--   • field_gc / field_drywall: no storage access (V1 RBAC)
--   • Org isolation: split_part(name, '/', 1) = profiles.organization_id::text
--   • Project folder must exist on projects table for that org
--
-- APPLY: supabase db push / apply_migration(name=drywall_field_photos_bucket)
-- ============================================================================

-- Helper: role check for drywall field photo policies
CREATE OR REPLACE FUNCTION public.user_can_access_drywall_photos(
  p_org_id_text text,
  p_for_write boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.organization_id::text = p_org_id_text
      AND (
        CASE
          WHEN p_for_write THEN
            p.roles && ARRAY['owner', 'office_gc', 'office_drywall']::text[]
          ELSE
            p.roles && ARRAY['owner', 'office_gc', 'office_drywall', 'viewer']::text[]
        END
      )
  );
$$;

COMMENT ON FUNCTION public.user_can_access_drywall_photos(text, boolean) IS
  'Drywall field-photos bucket: org-scoped read (incl. viewer) or write (owner/office_gc/office_drywall).';

-- Helper: path belongs to org + valid drywall project folder
CREATE OR REPLACE FUNCTION public.drywall_field_photo_path_ok(p_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    split_part(p_object_name, '/', 1) <> ''
    AND split_part(p_object_name, '/', 2) <> ''
    AND split_part(p_object_name, '/', 3) <> ''
    AND EXISTS (
      SELECT 1
      FROM public.projects pr
      WHERE pr.id::text = split_part(p_object_name, '/', 2)
        AND pr.organization_id::text = split_part(p_object_name, '/', 1)
    );
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'drywall-field-photos',
  'drywall-field-photos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- RLS is already enabled on storage.objects in hosted Supabase; do not ALTER here (requires table owner).

DROP POLICY IF EXISTS dfp_auth_select ON storage.objects;
DROP POLICY IF EXISTS dfp_auth_insert ON storage.objects;
DROP POLICY IF EXISTS dfp_auth_delete ON storage.objects;

CREATE POLICY dfp_auth_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'drywall-field-photos'
  AND public.user_can_access_drywall_photos(split_part(name, '/', 1), false)
  AND public.drywall_field_photo_path_ok(name)
);

CREATE POLICY dfp_auth_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'drywall-field-photos'
  AND public.user_can_access_drywall_photos(split_part(name, '/', 1), true)
  AND public.drywall_field_photo_path_ok(name)
);

CREATE POLICY dfp_auth_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'drywall-field-photos'
  AND public.user_can_access_drywall_photos(split_part(name, '/', 1), true)
  AND public.drywall_field_photo_path_ok(name)
);

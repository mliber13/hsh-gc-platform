-- ============================================================================
-- Migration: Create Quote Documents Storage Bucket
-- ============================================================================
-- 
-- Creates a Supabase Storage bucket for quote PDF documents with RLS policies
--

-- Create the storage bucket for quote documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'quote-documents',
  'quote-documents',
  false, -- not public, requires authentication
  10485760, -- 10MB max file size
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on the storage.objects table (if not already enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their organization's quote documents
CREATE POLICY "Users can view organization quote documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'quote-documents' AND
  auth.uid() IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid()
    AND up.organization_id = (
      SELECT SPLIT_PART(name, '/', 1)::uuid 
      FROM storage.objects 
      WHERE id = storage.objects.id
    )
  )
);

-- Policy: Users can upload quote documents for their organization
CREATE POLICY "Users can upload organization quote documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'quote-documents' AND
  auth.uid() IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid()
    AND SPLIT_PART(name, '/', 1)::uuid = up.organization_id
  )
);

-- Policy: Users can update their organization's quote documents
CREATE POLICY "Users can update organization quote documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'quote-documents' AND
  auth.uid() IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid()
    AND up.organization_id = (
      SELECT SPLIT_PART(name, '/', 1)::uuid 
      FROM storage.objects 
      WHERE id = storage.objects.id
    )
  )
);

-- Policy: Users can delete their organization's quote documents
CREATE POLICY "Users can delete organization quote documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'quote-documents' AND
  auth.uid() IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid()
    AND up.organization_id = (
      SELECT SPLIT_PART(name, '/', 1)::uuid 
      FROM storage.objects 
      WHERE id = storage.objects.id
    )
  )
);

-- Add comment for documentation
COMMENT ON TABLE storage.buckets IS 'Storage buckets for file uploads';


-- ============================================================================
-- Migration: Create Quote Documents Storage Bucket (Public Read)
-- ============================================================================
-- 
-- Creates a Supabase Storage bucket for quote PDF documents
-- Bucket is public so vendors can access drawings without authentication
--

-- Create the storage bucket for quote documents (public for vendor access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'quote-documents',
  'quote-documents',
  true, -- public so vendors can access without authentication
  52428800, -- 50MB max file size (increased for larger PDFs)
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'application/zip']::text[]
)
ON CONFLICT (id) DO UPDATE
SET 
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'application/zip']::text[];

-- Enable RLS on storage.objects (if not already enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies for quote-documents if they exist
DROP POLICY IF EXISTS "Users can view organization quote documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload organization quote documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update organization quote documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete organization quote documents" ON storage.objects;
DROP POLICY IF EXISTS "Public can view quote documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload quote documents" ON storage.objects;

-- Policy: Public can view quote documents (for vendors)
CREATE POLICY "Public can view quote documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'quote-documents');

-- Policy: Authenticated users can upload quote documents
CREATE POLICY "Authenticated users can upload quote documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'quote-documents' AND
  auth.uid() IS NOT NULL
);

-- Policy: Authenticated users can update their quote documents
CREATE POLICY "Authenticated users can update quote documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'quote-documents' AND
  auth.uid() IS NOT NULL
);

-- Policy: Authenticated users can delete their quote documents
CREATE POLICY "Authenticated users can delete quote documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'quote-documents' AND
  auth.uid() IS NOT NULL
);

-- Add comment for documentation
COMMENT ON TABLE storage.buckets IS 'Storage buckets for file uploads';


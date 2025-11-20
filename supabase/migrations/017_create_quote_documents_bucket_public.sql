-- ============================================================================
-- Migration: Create Quote Documents Storage Bucket (Public Read)
-- ============================================================================
-- 
-- Creates a Supabase Storage bucket for quote PDF documents
-- Bucket is public so vendors can access drawings without authentication
--
-- NOTE: Storage policies must be created through Supabase Dashboard or service role
-- This migration only creates the bucket. Policies should be set up manually.
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

-- Add comment for documentation
COMMENT ON TABLE storage.buckets IS 'Storage buckets for file uploads';

-- ============================================================================
-- IMPORTANT: Storage Policies Setup
-- ============================================================================
-- 
-- After running this migration, you need to set up storage policies through
-- the Supabase Dashboard:
--
-- 1. Go to Storage → Policies → quote-documents bucket
-- 2. Add these policies:
--
--    SELECT Policy (Public Read):
--    - Policy name: "Public can view quote documents"
--    - Allowed operation: SELECT
--    - Policy definition: bucket_id = 'quote-documents'
--    - Target roles: anon, authenticated
--
--    INSERT Policy (Authenticated Upload):
--    - Policy name: "Authenticated users can upload quote documents"
--    - Allowed operation: INSERT
--    - Policy definition: bucket_id = 'quote-documents' AND auth.uid() IS NOT NULL
--    - Target roles: authenticated
--
--    UPDATE Policy (Authenticated Update):
--    - Policy name: "Authenticated users can update quote documents"
--    - Allowed operation: UPDATE
--    - Policy definition: bucket_id = 'quote-documents' AND auth.uid() IS NOT NULL
--    - Target roles: authenticated
--
--    DELETE Policy (Authenticated Delete):
--    - Policy name: "Authenticated users can delete quote documents"
--    - Allowed operation: DELETE
--    - Policy definition: bucket_id = 'quote-documents' AND auth.uid() IS NOT NULL
--    - Target roles: authenticated
--


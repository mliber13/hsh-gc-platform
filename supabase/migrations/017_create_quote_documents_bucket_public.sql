-- ============================================================================
-- Migration: Create Quote Attachments Storage Bucket (Public Read)
-- ============================================================================
-- 
-- Creates a Supabase Storage bucket for quote PDF documents and attachments
-- Bucket is public so vendors can access drawings without authentication
--
-- NOTE: Storage buckets must be created through Supabase Dashboard (not SQL)
-- This migration is for documentation only. See SETUP_QUOTE_DOCUMENTS_BUCKET.md
--

-- NOTE: This SQL will fail - buckets must be created via Dashboard
-- Create the storage bucket for quote attachments (public for vendor access)
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'quote-attachments',
--   'quote-attachments',
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


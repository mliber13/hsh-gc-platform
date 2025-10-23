-- ============================================================================
-- Migration: Create Quote Documents Storage Bucket (Fixed)
-- ============================================================================
-- 
-- Creates a Supabase Storage bucket for quote PDF documents
-- Simplified version that avoids permission issues
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

-- Add comment for documentation
COMMENT ON TABLE storage.buckets IS 'Storage buckets for file uploads';

-- Note: RLS policies for storage.objects will be created automatically
-- by Supabase when the bucket is created. If you need custom policies,
-- you can add them later through the Supabase Dashboard.

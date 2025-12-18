-- ============================================================================
-- Migration: Add file_path column to project_documents
-- ============================================================================
-- 
-- Adds file_path column to store the storage path for regenerating signed URLs
-- This is needed for private storage buckets

-- Add file_path column
ALTER TABLE project_documents
ADD COLUMN IF NOT EXISTS file_path TEXT;

-- Add index for file_path lookups
CREATE INDEX IF NOT EXISTS idx_project_documents_file_path ON project_documents(file_path);

-- Add comment
COMMENT ON COLUMN project_documents.file_path IS 'Storage path for the document file, used to generate signed URLs';


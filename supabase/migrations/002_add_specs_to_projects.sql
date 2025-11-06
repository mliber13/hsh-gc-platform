-- ============================================================================
-- Add specs column to projects table
-- ============================================================================
-- 
-- This migration adds a JSONB column to store project specifications
-- (living square footage, bedrooms, bathrooms, foundation type, roof type, etc.)
--

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS specs JSONB;

-- Add a comment to document the column
COMMENT ON COLUMN projects.specs IS 'Project specifications including square footage, bedrooms, bathrooms, foundation type, roof type, etc.';


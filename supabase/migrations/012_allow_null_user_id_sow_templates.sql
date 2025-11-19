-- ============================================================================
-- Allow NULL user_id for System SOW Templates
-- ============================================================================
-- 
-- This migration alters the sow_templates table to allow NULL user_id
-- for system templates that are available to all users
--

-- Alter the user_id column to allow NULL
ALTER TABLE sow_templates 
  ALTER COLUMN user_id DROP NOT NULL;

-- Add RLS policy to allow all authenticated users to view system templates
DROP POLICY IF EXISTS "Users can view system SOW templates" ON sow_templates;
CREATE POLICY "Users can view system SOW templates"
  ON sow_templates FOR SELECT
  USING (
    user_id IS NULL
    AND auth.uid() IS NOT NULL
  );


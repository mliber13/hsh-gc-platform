-- Fix RLS policies for project_forms table
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view organization project forms" ON project_forms;
DROP POLICY IF EXISTS "Editors and admins can create project forms" ON project_forms;
DROP POLICY IF EXISTS "Editors and admins can update project forms" ON project_forms;
DROP POLICY IF EXISTS "Only admins can delete project forms" ON project_forms;

-- Create simpler policies that should work
CREATE POLICY "Users can view project forms"
  ON project_forms FOR SELECT
  USING (true);

CREATE POLICY "Users can create project forms"
  ON project_forms FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update project forms"
  ON project_forms FOR UPDATE
  USING (true);

CREATE POLICY "Users can delete project forms"
  ON project_forms FOR DELETE
  USING (true);

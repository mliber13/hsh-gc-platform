-- Debug RLS policies for project_forms
-- Check if the helper functions exist and work
SELECT 
  get_user_organization() as user_org,
  user_can_edit() as can_edit,
  user_is_admin() as is_admin,
  is_user_active() as is_active;

-- Check current user
SELECT auth.uid() as current_user_id;

-- Check if we can insert a test record
INSERT INTO project_forms (
  organization_id,
  project_id,
  form_type,
  form_name,
  form_schema,
  form_data,
  status
) VALUES (
  'test-org',
  (SELECT id FROM projects LIMIT 1),
  'test',
  'Test Form',
  '{}',
  '{}',
  'draft'
) RETURNING *;

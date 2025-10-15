-- ============================================================================
-- HSH GC Platform - Multi-User Shared Access Migration
-- ============================================================================
-- 
-- This migration changes from user-isolated data to company-shared data
-- with role-based permissions
--

-- ============================================================================
-- ADD ROLES AND ORGANIZATION SUPPORT
-- ============================================================================

-- Add columns to profiles (only if they don't exist)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'default-org',
ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users,
ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create index for organization lookups (drop first if exists)
DROP INDEX IF EXISTS idx_profiles_organization_id;
CREATE INDEX idx_profiles_organization_id ON profiles(organization_id);
DROP INDEX IF EXISTS idx_profiles_role;
CREATE INDEX idx_profiles_role ON profiles(role);

-- ============================================================================
-- UPDATE ALL TABLES TO USE ORGANIZATION INSTEAD OF USER
-- ============================================================================

-- Projects: Change from user_id to organization_id
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'default-org',
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users;

DROP INDEX IF EXISTS idx_projects_organization_id;
CREATE INDEX idx_projects_organization_id ON projects(organization_id);

-- Estimates
ALTER TABLE estimates
ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'default-org';

DROP INDEX IF EXISTS idx_estimates_organization_id;
CREATE INDEX idx_estimates_organization_id ON estimates(organization_id);

-- Trades
ALTER TABLE trades
ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'default-org';

DROP INDEX IF EXISTS idx_trades_organization_id;
CREATE INDEX idx_trades_organization_id ON trades(organization_id);

-- Project Actuals
ALTER TABLE project_actuals
ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'default-org';

DROP INDEX IF EXISTS idx_project_actuals_organization_id;
CREATE INDEX idx_project_actuals_organization_id ON project_actuals(organization_id);

-- Labor Entries
ALTER TABLE labor_entries
ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'default-org',
ADD COLUMN IF NOT EXISTS entered_by UUID REFERENCES auth.users;

DROP INDEX IF EXISTS idx_labor_entries_organization_id;
CREATE INDEX idx_labor_entries_organization_id ON labor_entries(organization_id);

-- Material Entries
ALTER TABLE material_entries
ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'default-org',
ADD COLUMN IF NOT EXISTS entered_by UUID REFERENCES auth.users;

DROP INDEX IF EXISTS idx_material_entries_organization_id;
CREATE INDEX idx_material_entries_organization_id ON material_entries(organization_id);

-- Subcontractor Entries
ALTER TABLE subcontractor_entries
ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'default-org',
ADD COLUMN IF NOT EXISTS entered_by UUID REFERENCES auth.users;

DROP INDEX IF EXISTS idx_subcontractor_entries_organization_id;
CREATE INDEX idx_subcontractor_entries_organization_id ON subcontractor_entries(organization_id);

-- Schedules
ALTER TABLE schedules
ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'default-org';

DROP INDEX IF EXISTS idx_schedules_organization_id;
CREATE INDEX idx_schedules_organization_id ON schedules(organization_id);

-- Change Orders
ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'default-org',
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users;

DROP INDEX IF EXISTS idx_change_orders_organization_id;
CREATE INDEX idx_change_orders_organization_id ON change_orders(organization_id);

-- Plans
ALTER TABLE plans
ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'default-org';

DROP INDEX IF EXISTS idx_plans_organization_id;
CREATE INDEX idx_plans_organization_id ON plans(organization_id);

-- Item Templates
ALTER TABLE item_templates
ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'default-org';

DROP INDEX IF EXISTS idx_item_templates_organization_id;
CREATE INDEX idx_item_templates_organization_id ON item_templates(organization_id);

-- Estimate Templates
ALTER TABLE estimate_templates
ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'default-org';

DROP INDEX IF EXISTS idx_estimate_templates_organization_id;
CREATE INDEX idx_estimate_templates_organization_id ON estimate_templates(organization_id);

-- ============================================================================
-- DROP OLD RLS POLICIES
-- ============================================================================

-- Profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- Projects
DROP POLICY IF EXISTS "Users can view own projects" ON projects;
DROP POLICY IF EXISTS "Users can create own projects" ON projects;
DROP POLICY IF EXISTS "Users can update own projects" ON projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON projects;

-- Estimates
DROP POLICY IF EXISTS "Users can view own estimates" ON estimates;
DROP POLICY IF EXISTS "Users can create own estimates" ON estimates;
DROP POLICY IF EXISTS "Users can update own estimates" ON estimates;
DROP POLICY IF EXISTS "Users can delete own estimates" ON estimates;

-- Trades
DROP POLICY IF EXISTS "Users can view own trades" ON trades;
DROP POLICY IF EXISTS "Users can create own trades" ON trades;
DROP POLICY IF EXISTS "Users can update own trades" ON trades;
DROP POLICY IF EXISTS "Users can delete own trades" ON trades;

-- Actuals
DROP POLICY IF EXISTS "Users can view own actuals" ON project_actuals;
DROP POLICY IF EXISTS "Users can create own actuals" ON project_actuals;
DROP POLICY IF EXISTS "Users can update own actuals" ON project_actuals;
DROP POLICY IF EXISTS "Users can delete own actuals" ON project_actuals;

-- Labor Entries
DROP POLICY IF EXISTS "Users can view own labor entries" ON labor_entries;
DROP POLICY IF EXISTS "Users can create own labor entries" ON labor_entries;
DROP POLICY IF EXISTS "Users can update own labor entries" ON labor_entries;
DROP POLICY IF EXISTS "Users can delete own labor entries" ON labor_entries;

-- Material Entries
DROP POLICY IF EXISTS "Users can view own material entries" ON material_entries;
DROP POLICY IF EXISTS "Users can create own material entries" ON material_entries;
DROP POLICY IF EXISTS "Users can update own material entries" ON material_entries;
DROP POLICY IF EXISTS "Users can delete own material entries" ON material_entries;

-- Subcontractor Entries
DROP POLICY IF EXISTS "Users can view own subcontractor entries" ON subcontractor_entries;
DROP POLICY IF EXISTS "Users can create own subcontractor entries" ON subcontractor_entries;
DROP POLICY IF EXISTS "Users can update own subcontractor entries" ON subcontractor_entries;
DROP POLICY IF EXISTS "Users can delete own subcontractor entries" ON subcontractor_entries;

-- Schedules
DROP POLICY IF EXISTS "Users can view own schedules" ON schedules;
DROP POLICY IF EXISTS "Users can create own schedules" ON schedules;
DROP POLICY IF EXISTS "Users can update own schedules" ON schedules;
DROP POLICY IF EXISTS "Users can delete own schedules" ON schedules;

-- Change Orders
DROP POLICY IF EXISTS "Users can view own change orders" ON change_orders;
DROP POLICY IF EXISTS "Users can create own change orders" ON change_orders;
DROP POLICY IF EXISTS "Users can update own change orders" ON change_orders;
DROP POLICY IF EXISTS "Users can delete own change orders" ON change_orders;

-- Plans
DROP POLICY IF EXISTS "Users can view own plans" ON plans;
DROP POLICY IF EXISTS "Users can create own plans" ON plans;
DROP POLICY IF EXISTS "Users can update own plans" ON plans;
DROP POLICY IF EXISTS "Users can delete own plans" ON plans;

-- Item Templates
DROP POLICY IF EXISTS "Users can view own item templates" ON item_templates;
DROP POLICY IF EXISTS "Users can create own item templates" ON item_templates;
DROP POLICY IF EXISTS "Users can update own item templates" ON item_templates;
DROP POLICY IF EXISTS "Users can delete own item templates" ON item_templates;

-- Estimate Templates
DROP POLICY IF EXISTS "Users can view own estimate templates" ON estimate_templates;
DROP POLICY IF EXISTS "Users can create own estimate templates" ON estimate_templates;
DROP POLICY IF EXISTS "Users can update own estimate templates" ON estimate_templates;
DROP POLICY IF EXISTS "Users can delete own estimate templates" ON estimate_templates;

-- User Invitations (drop any existing policies)
DROP POLICY IF EXISTS "Admins can view invitations in their organization" ON user_invitations;
DROP POLICY IF EXISTS "Admins can create invitations" ON user_invitations;
DROP POLICY IF EXISTS "Admins can update invitations" ON user_invitations;
DROP POLICY IF EXISTS "Admins can delete invitations" ON user_invitations;

-- ============================================================================
-- CREATE NEW RLS POLICIES (ORGANIZATION-BASED WITH ROLES)
-- ============================================================================

-- Drop existing helper functions first to avoid conflicts (CASCADE removes dependent policies)
DROP FUNCTION IF EXISTS get_user_organization() CASCADE;
DROP FUNCTION IF EXISTS is_user_active() CASCADE;
DROP FUNCTION IF EXISTS get_user_role() CASCADE;
DROP FUNCTION IF EXISTS user_can_edit() CASCADE;
DROP FUNCTION IF EXISTS user_is_admin() CASCADE;

-- Helper function to get user's organization
CREATE FUNCTION get_user_organization()
RETURNS TEXT AS $$
  SELECT COALESCE(organization_id, 'default-org') FROM profiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER;

-- Helper function to check if user is active
CREATE FUNCTION is_user_active()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(is_active, true) FROM profiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER;

-- Helper function to get user's role
CREATE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT COALESCE(role, 'viewer') FROM profiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER;

-- Helper function to check if user can edit
CREATE FUNCTION user_can_edit()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(role, 'viewer') IN ('admin', 'editor') FROM profiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER;

-- Helper function to check if user is admin
CREATE FUNCTION user_is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(role, 'viewer') = 'admin' FROM profiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER;

-- ============================================================================
-- PROFILES RLS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view profiles in their organization" ON profiles;
CREATE POLICY "Users can view profiles in their organization"
  ON profiles FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id AND is_user_active());

DROP POLICY IF EXISTS "Admins can update any profile in their organization" ON profiles;
CREATE POLICY "Admins can update any profile in their organization"
  ON profiles FOR UPDATE
  USING (organization_id = get_user_organization() AND user_is_admin());

DROP POLICY IF EXISTS "Admins can insert profiles for their organization" ON profiles;
CREATE POLICY "Admins can insert profiles for their organization"
  ON profiles FOR INSERT
  WITH CHECK (organization_id = get_user_organization() AND user_is_admin());

-- ============================================================================
-- PROJECTS RLS POLICIES (SHARED ACCESS)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view organization projects" ON projects;
CREATE POLICY "Users can view organization projects"
  ON projects FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

DROP POLICY IF EXISTS "Editors and admins can create projects" ON projects;
CREATE POLICY "Editors and admins can create projects"
  ON projects FOR INSERT
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Editors and admins can update projects" ON projects;
CREATE POLICY "Editors and admins can update projects"
  ON projects FOR UPDATE
  USING (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Only admins can delete projects" ON projects;
CREATE POLICY "Only admins can delete projects"
  ON projects FOR DELETE
  USING (organization_id = get_user_organization() AND user_is_admin());

-- ============================================================================
-- ESTIMATES RLS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view organization estimates" ON estimates;
CREATE POLICY "Users can view organization estimates"
  ON estimates FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

DROP POLICY IF EXISTS "Editors and admins can create estimates" ON estimates;
CREATE POLICY "Editors and admins can create estimates"
  ON estimates FOR INSERT
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Editors and admins can update estimates" ON estimates;
CREATE POLICY "Editors and admins can update estimates"
  ON estimates FOR UPDATE
  USING (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Only admins can delete estimates" ON estimates;
CREATE POLICY "Only admins can delete estimates"
  ON estimates FOR DELETE
  USING (organization_id = get_user_organization() AND user_is_admin());

-- ============================================================================
-- TRADES RLS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view organization trades" ON trades;
CREATE POLICY "Users can view organization trades"
  ON trades FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

DROP POLICY IF EXISTS "Editors and admins can create trades" ON trades;
CREATE POLICY "Editors and admins can create trades"
  ON trades FOR INSERT
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Editors and admins can update trades" ON trades;
CREATE POLICY "Editors and admins can update trades"
  ON trades FOR UPDATE
  USING (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Editors and admins can delete trades" ON trades;
CREATE POLICY "Editors and admins can delete trades"
  ON trades FOR DELETE
  USING (organization_id = get_user_organization() AND user_can_edit());

-- ============================================================================
-- ACTUALS RLS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view organization actuals" ON project_actuals;
CREATE POLICY "Users can view organization actuals"
  ON project_actuals FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

DROP POLICY IF EXISTS "Editors and admins can create actuals" ON project_actuals;
CREATE POLICY "Editors and admins can create actuals"
  ON project_actuals FOR INSERT
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Editors and admins can update actuals" ON project_actuals;
CREATE POLICY "Editors and admins can update actuals"
  ON project_actuals FOR UPDATE
  USING (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Only admins can delete actuals" ON project_actuals;
CREATE POLICY "Only admins can delete actuals"
  ON project_actuals FOR DELETE
  USING (organization_id = get_user_organization() AND user_is_admin());

-- ============================================================================
-- ACTUAL ENTRIES RLS POLICIES
-- ============================================================================

-- Labor Entries
DROP POLICY IF EXISTS "Users can view organization labor entries" ON labor_entries;
CREATE POLICY "Users can view organization labor entries"
  ON labor_entries FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

DROP POLICY IF EXISTS "Editors and admins can create labor entries" ON labor_entries;
CREATE POLICY "Editors and admins can create labor entries"
  ON labor_entries FOR INSERT
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Editors and admins can update labor entries" ON labor_entries;
CREATE POLICY "Editors and admins can update labor entries"
  ON labor_entries FOR UPDATE
  USING (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Editors and admins can delete labor entries" ON labor_entries;
CREATE POLICY "Editors and admins can delete labor entries"
  ON labor_entries FOR DELETE
  USING (organization_id = get_user_organization() AND user_can_edit());

-- Material Entries
DROP POLICY IF EXISTS "Users can view organization material entries" ON material_entries;
CREATE POLICY "Users can view organization material entries"
  ON material_entries FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

DROP POLICY IF EXISTS "Editors and admins can create material entries" ON material_entries;
CREATE POLICY "Editors and admins can create material entries"
  ON material_entries FOR INSERT
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Editors and admins can update material entries" ON material_entries;
CREATE POLICY "Editors and admins can update material entries"
  ON material_entries FOR UPDATE
  USING (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Editors and admins can delete material entries" ON material_entries;
CREATE POLICY "Editors and admins can delete material entries"
  ON material_entries FOR DELETE
  USING (organization_id = get_user_organization() AND user_can_edit());

-- Subcontractor Entries
DROP POLICY IF EXISTS "Users can view organization subcontractor entries" ON subcontractor_entries;
CREATE POLICY "Users can view organization subcontractor entries"
  ON subcontractor_entries FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

DROP POLICY IF EXISTS "Editors and admins can create subcontractor entries" ON subcontractor_entries;
CREATE POLICY "Editors and admins can create subcontractor entries"
  ON subcontractor_entries FOR INSERT
  WITH CHECK (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Editors and admins can update subcontractor entries" ON subcontractor_entries;
CREATE POLICY "Editors and admins can update subcontractor entries"
  ON subcontractor_entries FOR UPDATE
  USING (organization_id = get_user_organization() AND user_can_edit());

DROP POLICY IF EXISTS "Editors and admins can delete subcontractor entries" ON subcontractor_entries;
CREATE POLICY "Editors and admins can delete subcontractor entries"
  ON subcontractor_entries FOR DELETE
  USING (organization_id = get_user_organization() AND user_can_edit());

-- ============================================================================
-- OTHER TABLES RLS POLICIES
-- ============================================================================

-- Schedules
DROP POLICY IF EXISTS "Users can view organization schedules" ON schedules;
CREATE POLICY "Users can view organization schedules"
  ON schedules FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

DROP POLICY IF EXISTS "Editors and admins can manage schedules" ON schedules;
CREATE POLICY "Editors and admins can manage schedules"
  ON schedules FOR ALL
  USING (organization_id = get_user_organization() AND user_can_edit());

-- Change Orders
DROP POLICY IF EXISTS "Users can view organization change orders" ON change_orders;
CREATE POLICY "Users can view organization change orders"
  ON change_orders FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

DROP POLICY IF EXISTS "Editors and admins can manage change orders" ON change_orders;
CREATE POLICY "Editors and admins can manage change orders"
  ON change_orders FOR ALL
  USING (organization_id = get_user_organization() AND user_can_edit());

-- Plans
DROP POLICY IF EXISTS "Users can view organization plans" ON plans;
CREATE POLICY "Users can view organization plans"
  ON plans FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

DROP POLICY IF EXISTS "Editors and admins can manage plans" ON plans;
CREATE POLICY "Editors and admins can manage plans"
  ON plans FOR ALL
  USING (organization_id = get_user_organization() AND user_can_edit());

-- Item Templates
DROP POLICY IF EXISTS "Users can view organization item templates" ON item_templates;
CREATE POLICY "Users can view organization item templates"
  ON item_templates FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

DROP POLICY IF EXISTS "Editors and admins can manage item templates" ON item_templates;
CREATE POLICY "Editors and admins can manage item templates"
  ON item_templates FOR ALL
  USING (organization_id = get_user_organization() AND user_can_edit());

-- Estimate Templates
DROP POLICY IF EXISTS "Users can view organization estimate templates" ON estimate_templates;
CREATE POLICY "Users can view organization estimate templates"
  ON estimate_templates FOR SELECT
  USING (organization_id = get_user_organization() AND is_user_active());

DROP POLICY IF EXISTS "Editors and admins can manage estimate templates" ON estimate_templates;
CREATE POLICY "Editors and admins can manage estimate templates"
  ON estimate_templates FOR ALL
  USING (organization_id = get_user_organization() AND user_can_edit());

-- ============================================================================
-- UPDATE YOUR FIRST USER TO BE ADMIN
-- ============================================================================

-- Find the first user and make them admin
-- Run this AFTER you've created your account
UPDATE profiles 
SET role = 'admin'
WHERE id = (SELECT id FROM profiles ORDER BY created_at LIMIT 1);

-- ============================================================================
-- CREATE/UPDATE INVITATIONS TABLE
-- ============================================================================

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_invitations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  organization_id TEXT NOT NULL,
  invited_by UUID REFERENCES auth.users NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add status column if it doesn't exist (for existing tables with old schema)
ALTER TABLE user_invitations
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired'));

-- Drop old columns if they exist
ALTER TABLE user_invitations
DROP COLUMN IF EXISTS invitation_token,
DROP COLUMN IF EXISTS accepted_at;

-- RLS for invitations
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view invitations in their organization" ON user_invitations;
CREATE POLICY "Admins can view invitations in their organization"
  ON user_invitations FOR SELECT
  USING (organization_id = get_user_organization() AND user_is_admin());

DROP POLICY IF EXISTS "Admins can create invitations" ON user_invitations;
CREATE POLICY "Admins can create invitations"
  ON user_invitations FOR INSERT
  WITH CHECK (organization_id = get_user_organization() AND user_is_admin());

DROP POLICY IF EXISTS "Admins can update invitations" ON user_invitations;
CREATE POLICY "Admins can update invitations"
  ON user_invitations FOR UPDATE
  USING (organization_id = get_user_organization() AND user_is_admin());

DROP POLICY IF EXISTS "Admins can delete invitations" ON user_invitations;
CREATE POLICY "Admins can delete invitations"
  ON user_invitations FOR DELETE
  USING (organization_id = get_user_organization() AND user_is_admin());

-- Index
DROP INDEX IF EXISTS idx_invitations_status;
CREATE INDEX idx_invitations_status ON user_invitations(status);
DROP INDEX IF EXISTS idx_invitations_email;
CREATE INDEX idx_invitations_email ON user_invitations(email);
DROP INDEX IF EXISTS idx_invitations_organization;
CREATE INDEX idx_invitations_organization ON user_invitations(organization_id);


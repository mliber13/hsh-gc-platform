-- ============================================================================
-- HSH GC Platform - Fix User Profile Creation
-- ============================================================================
-- 
-- This migration fixes the issue where manually created users don't have
-- corresponding profile records in the profiles table
--

-- ============================================================================
-- CREATE TRIGGER TO AUTO-CREATE PROFILES
-- ============================================================================

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, organization_id, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'default-org',
    'viewer',
    true
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- CREATE MISSING PROFILES FOR EXISTING USERS
-- ============================================================================

-- Insert profiles for any existing auth.users that don't have profiles
INSERT INTO public.profiles (id, email, full_name, organization_id, role, is_active)
SELECT 
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', au.email),
  'default-org',
  'viewer',
  true
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
WHERE p.id IS NULL;

-- ============================================================================
-- UPDATE HELPER FUNCTIONS TO HANDLE MISSING PROFILES
-- ============================================================================

-- Update helper functions to handle cases where profile might not exist
CREATE OR REPLACE FUNCTION get_user_organization()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (SELECT organization_id FROM profiles WHERE id = auth.uid()),
    'default-org'
  )
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_user_active()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_active FROM profiles WHERE id = auth.uid()),
    true
  )
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (SELECT role FROM profiles WHERE id = auth.uid()),
    'viewer'
  )
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION user_can_edit()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role FROM profiles WHERE id = auth.uid()),
    'viewer'
  ) IN ('admin', 'editor')
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION user_is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role FROM profiles WHERE id = auth.uid()),
    'viewer'
  ) = 'admin'
$$ LANGUAGE SQL SECURITY DEFINER;

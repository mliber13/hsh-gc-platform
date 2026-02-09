-- ============================================================================
-- Auto-add Contact Directory contact when a new user (profile) is created
-- ============================================================================
--
-- When a row is inserted into profiles (new app user), automatically insert
-- a matching standalone contact so they appear in the Contact Directory
-- without a manual step. Uses USER label (admin can change to Employee, 1099,
-- etc. in the directory); name from full_name or email.
-- Skips if a contact already exists for that org + email (e.g. added manually).
--

CREATE OR REPLACE FUNCTION public.create_contact_from_new_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  contact_name TEXT;
BEGIN
  -- Only create contact if no contact exists for this org + email (case-insensitive)
  IF EXISTS (
    SELECT 1 FROM contacts
    WHERE organization_id = NEW.organization_id
      AND lower(trim(email)) = lower(trim(NEW.email))
    LIMIT 1
  ) THEN
    RETURN NEW;
  END IF;

  -- Name: full_name if present and non-empty, else part before @ in email, else email
  contact_name := coalesce(
    nullif(trim(NEW.full_name), ''),
    split_part(NEW.email, '@', 1),
    NEW.email
  );

  INSERT INTO contacts (
    organization_id,
    label,
    name,
    email,
    phone,
    role,
    notes
  ) VALUES (
    NEW.organization_id,
    'USER',
    contact_name,
    nullif(trim(NEW.email), ''),
    NULL,
    NULL,
    NULL
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created_create_contact ON profiles;
CREATE TRIGGER on_profile_created_create_contact
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_contact_from_new_profile();

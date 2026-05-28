BEGIN;

-- 1) Add Phase 1 RBAC columns (additive only)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT ARRAY['viewer']::text[],
  ADD COLUMN IF NOT EXISTS is_meeting_operator boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_admin_qb boolean NOT NULL DEFAULT false;

-- 2) Enforce allowed role values inside roles[]
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_roles_allowed_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_roles_allowed_check
      CHECK (
        roles <@ ARRAY[
          'owner',
          'office_gc',
          'office_drywall',
          'field_gc',
          'field_drywall',
          'viewer'
        ]::text[]
      );
  END IF;
END $$;

-- 3) Backfill all current known users by email mapping
WITH mapping AS (
  SELECT * FROM (VALUES
    ('mark@hshdrywall.com', ARRAY['owner']::text[], true, true),
    ('erik@hshdrywall.com', ARRAY['office_gc']::text[], false, false),
    ('jennifer@hshcontractor.com', ARRAY['office_gc']::text[], false, false),
    ('kristen@hshdrywall.com', ARRAY['office_gc']::text[], false, false),
    ('tate@hshdrywall.com', ARRAY['viewer']::text[], false, false),
    ('lisa@hshcontractor.com', ARRAY['office_gc']::text[], false, false),
    ('tess@kibbeconsulting.com', ARRAY['office_gc']::text[], false, false)
  ) AS m(email_lc, roles_new, is_meeting_operator_new, can_admin_qb_new)
)
UPDATE public.profiles p
SET
  roles = m.roles_new,
  is_meeting_operator = m.is_meeting_operator_new,
  can_admin_qb = m.can_admin_qb_new,
  updated_at = NOW()
FROM mapping m
WHERE lower(p.email) = m.email_lc;

COMMIT;

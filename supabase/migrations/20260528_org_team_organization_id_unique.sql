-- Ensure org_team supports upsert(onConflict: organization_id)
-- One row per organization.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'org_team_organization_id_unique'
      AND conrelid = 'public.org_team'::regclass
  ) THEN
    ALTER TABLE public.org_team
      ADD CONSTRAINT org_team_organization_id_unique UNIQUE (organization_id);
  END IF;
END $$;

COMMIT;

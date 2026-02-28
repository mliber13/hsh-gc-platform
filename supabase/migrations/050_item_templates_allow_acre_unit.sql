-- Allow any unit value (including 'acre') in item_templates.default_unit.
-- If a CHECK constraint was ever added restricting default_unit to a fixed list, drop it.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'item_templates'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%default_unit%'
  LOOP
    EXECUTE format('ALTER TABLE item_templates DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- ============================================================================
-- Allow hard delete of auth.users without FK block errors
-- ============================================================================
--
-- Converts all single-column foreign keys that reference auth.users and
-- currently use NO ACTION/RESTRICT behavior into ON DELETE SET NULL.
-- Also drops NOT NULL on those FK columns to allow SET NULL.
--
-- This preserves historical records (documents, feedback, deals, etc.)
-- while allowing auth user rows to be hard-deleted.

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT
      con.conname AS constraint_name,
      nsp.nspname AS schema_name,
      rel.relname AS table_name,
      att.attname AS column_name,
      refatt.attname AS ref_column_name
    FROM pg_constraint con
    JOIN pg_class rel
      ON rel.oid = con.conrelid
    JOIN pg_namespace nsp
      ON nsp.oid = rel.relnamespace
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid
     AND att.attnum = con.conkey[1]
    JOIN pg_attribute refatt
      ON refatt.attrelid = con.confrelid
     AND refatt.attnum = con.confkey[1]
    WHERE con.contype = 'f'
      AND con.confrelid = 'auth.users'::regclass
      AND con.confdeltype = 'a' -- NO ACTION
      AND array_length(con.conkey, 1) = 1
  LOOP
    -- Ensure FK column accepts NULL for ON DELETE SET NULL behavior
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I DROP NOT NULL',
      rec.schema_name,
      rec.table_name,
      rec.column_name
    );

    -- Replace FK with ON DELETE SET NULL
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      rec.schema_name,
      rec.table_name,
      rec.constraint_name
    );

    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(%I) ON DELETE SET NULL',
      rec.schema_name,
      rec.table_name,
      rec.constraint_name,
      rec.column_name,
      rec.ref_column_name
    );
  END LOOP;
END $$;

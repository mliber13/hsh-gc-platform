-- Two document types for the drywall job's files (Mark, 2026-10-15): a sent quote PDF, filed
-- automatically each time a quote is marked sent, and the customer's purchase order, attached
-- at PO intake. Both are money documents: crew read only 'plan' and 'specification'
-- (20260918131244_crew_job_documents.sql), so neither reaches them.
--
-- The CHECK was created inline in 019 and never altered, so its name is Postgres's default.
-- Looked up rather than assumed: dropping a guessed name that does not exist would leave the
-- old CHECK in place and every insert of the new types failing.

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.project_documents'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%scope-of-work-signoff%';

  IF con_name IS NULL THEN
    RAISE EXCEPTION 'project_documents type CHECK not found — inspect before re-running';
  END IF;

  EXECUTE format('ALTER TABLE public.project_documents DROP CONSTRAINT %I', con_name);
END $$;

ALTER TABLE public.project_documents
  ADD CONSTRAINT project_documents_type_check CHECK (type IN (
    'contract',
    'plan',
    'specification',
    'permit',
    'invoice',
    'change-order',
    'rfi',
    'submittal',
    'inspection',
    'warranty',
    'photo',
    'subcontractor-agreement',
    'scope-of-work-signoff',
    'quote',
    'purchase-order',
    'other'
  ));

-- Verify: exactly one type CHECK, and it admits the new values and still refuses junk.
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_constraint c
  WHERE c.conrelid = 'public.project_documents'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%scope-of-work-signoff%';
  IF n <> 1 THEN
    RAISE EXCEPTION 'expected one project_documents type CHECK, found %', n;
  END IF;
  IF NOT (SELECT pg_get_constraintdef(oid) LIKE '%''quote''%' AND pg_get_constraintdef(oid) LIKE '%''purchase-order''%'
          FROM pg_constraint
          WHERE conrelid = 'public.project_documents'::regclass AND conname = 'project_documents_type_check') THEN
    RAISE EXCEPTION 'project_documents_type_check does not admit quote / purchase-order';
  END IF;
END $$;

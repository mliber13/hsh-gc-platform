-- Crew may upload a field photo to any project in their organisation. DECIDED — do not re-scope.
--
-- This policy has flipped three times:
--   20260913120000  scoped uploads to assigned projects (carry-over from 1B)
--   20260914120000  reverted by Mark: crew photograph jobs they are not scheduled on — "a measurer
--                   sent to look at something, someone dropping by a job on their way past"
--   20260930120000  re-scoped, citing 1B's note but not the 9/14 revert
-- Mark, 2026-10-15, asked again with the history in front of him: any job (the 9/14 call).
--
-- Why it is safe: uploading into another project's folder inside your own org is untidy, not
-- dangerous. The risk 1B set out to close — a crew member DELETING someone else's photo, evidence
-- in an extra-work dispute — is dfp_auth_delete, which keeps drywall_photo_crew_scope_ok and is not
-- touched here. Org membership and path shape still gate the upload.

BEGIN;

DROP POLICY IF EXISTS dfp_auth_insert ON storage.objects;
CREATE POLICY dfp_auth_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'drywall-field-photos'
  AND public.user_can_access_drywall_photos(split_part(name, '/', 1), true)
  AND public.drywall_field_photo_path_ok(name)
);

COMMENT ON POLICY dfp_auth_insert ON storage.objects IS
  'Org-wide upload BY DECISION (Mark 2026-09-14, re-confirmed 2026-10-15 after it was re-scoped on '
  '2026-09-30): crew photograph jobs they are not scheduled on. Do not add the crew-scope term '
  'without asking him. dfp_auth_delete stays assignment-scoped — that is what protects photos.';

-- ---------------------------------------------------------------------------
-- Verification — insert is org-wide again, and the DELETE scope is still in place.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_insert text;
  v_delete text;
BEGIN
  SELECT with_check INTO v_insert
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'dfp_auth_insert';
  SELECT qual INTO v_delete
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'dfp_auth_delete';

  IF v_insert IS NULL THEN
    RAISE EXCEPTION 'dfp_auth_insert is missing after this migration';
  END IF;
  IF position('drywall_photo_crew_scope_ok' IN v_insert) > 0 THEN
    RAISE EXCEPTION 'dfp_auth_insert still carries the crew-scope term: %', v_insert;
  END IF;
  IF position('drywall_field_photo_path_ok' IN v_insert) = 0 THEN
    RAISE EXCEPTION 'dfp_auth_insert lost its path check: %', v_insert;
  END IF;
  IF v_delete IS NULL OR position('drywall_photo_crew_scope_ok' IN v_delete) = 0 THEN
    RAISE EXCEPTION 'dfp_auth_delete must keep the crew-scope term: %', v_delete;
  END IF;
END
$verify$;

COMMIT;

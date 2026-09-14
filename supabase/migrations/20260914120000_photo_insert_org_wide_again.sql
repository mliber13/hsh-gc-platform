-- Restore org-wide photo UPLOAD. Keep the scoped DELETE.
--
-- 20260913120000 (Batch 1D, item 5) added drywall_photo_crew_scope_ok to
-- dfp_auth_insert, so a crew account could only upload into a project it was
-- assigned to via a schedule_items row. That broke a working field path within a
-- day: crew take site photos on jobs they are not formally scheduled on -- a
-- measurer sent to look at something, someone dropping by a job on their way
-- past. The assumption behind the change, that crew only ever touch assigned
-- jobs, is not how the field actually works.
--
-- The real risk 1B set out to close was a crew member DELETING someone else's
-- photo -- evidence in an extra-work dispute. dfp_auth_delete keeps the scope
-- term and stays closed. Uploading into another project's folder inside your own
-- org is untidy, not dangerous, and the cost of blocking it is site photos that
-- never get taken.
--
-- This restores dfp_auth_insert to exactly its pre-1D predicate
-- (20260529120000:91): same org, valid path shape, nothing more.
--
-- drywall_photo_crew_scope_ok stays defined -- dfp_auth_delete still uses it.

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
  'Org-wide upload by design. Scoping this to assigned projects (1D) blocked crew '
  'photographing jobs they are not scheduled on, which is normal field behaviour. '
  'The delete policy stays assignment-scoped -- that is the one that protects '
  'someone else''s photos.';

COMMIT;

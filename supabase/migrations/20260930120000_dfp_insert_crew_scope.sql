-- Crew can no longer upload a field photo into a project they are not on.
--
-- `dfp_auth_insert` (20260529120000:91) carries the org-wide predicate that
-- `dfp_auth_delete` used to, so any crew account can write into ANY project's folder in the
-- organisation. Batch 1B scoped the DELETE side and recorded this one in its own comment:
--
--     Note for the report: dfp_auth_insert carries the identical org-wide predicate,
--     so uploads are not project-scoped either. Left alone here on purpose -- this
--     brief says report, do not fix -- but it wants the same treatment.
--
-- This is that treatment. The predicate is `drywall_photo_crew_scope_ok`, unchanged and
-- already live on DELETE since 20260911120000 — anyone who is not pure crew passes, as does
-- a field foreman, as does a crew member assigned to the project in path segment 2.
--
-- The crew upload path really is subject to this. `persistFieldTakeoffPhotos` routes only
-- the takeoff METADATA through a SECURITY DEFINER RPC; the file itself goes to Storage as
-- the crew user, so the policy applies. A measurer uploading to their own assigned job still
-- passes on `crew_is_assigned_to_project`, which is the same test that has gated their photo
-- deletions since September without complaint.
--
-- Checked against the live bucket first: 128 objects, 127 with a real project id in segment
-- 2. The one exception belongs to a project that has since been deleted, so no crew member
-- can be assigned to it and denying writes there is the correct outcome.

BEGIN;

DROP POLICY IF EXISTS dfp_auth_insert ON storage.objects;
CREATE POLICY dfp_auth_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'drywall-field-photos'
  AND public.user_can_access_drywall_photos(split_part(name, '/', 1), true)
  AND public.drywall_field_photo_path_ok(name)
  AND public.drywall_photo_crew_scope_ok(name)
);

-- ---------------------------------------------------------------------------
-- Verification — the policy must exist and must carry the crew-scope term.
-- A policy that silently lost a term is the failure this repo has shipped twice.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_check text;
BEGIN
  SELECT with_check INTO v_check
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'dfp_auth_insert';

  IF v_check IS NULL THEN
    RAISE EXCEPTION 'dfp_auth_insert is missing after this migration';
  END IF;

  IF position('drywall_photo_crew_scope_ok' IN v_check) = 0 THEN
    RAISE EXCEPTION 'dfp_auth_insert does not reference drywall_photo_crew_scope_ok: %', v_check;
  END IF;

  RAISE NOTICE 'dfp_insert_crew_scope: OK — uploads are project-scoped for crew';
END
$verify$;

COMMIT;

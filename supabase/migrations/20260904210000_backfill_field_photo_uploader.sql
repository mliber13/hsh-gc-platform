-- Backfill the uploader onto existing field photos.
--
-- FieldPhotoRef never recorded who took a photo, so every image in a job's
-- gallery looked identical in provenance — there was no way to tell a crew
-- member's photos from the measurer's. New uploads now carry uploadedByUserId,
-- but the existing ones would have stayed anonymous forever.
--
-- They are recoverable: the storage upload runs client-side under each user's
-- own session, so Supabase recorded the uploader on the storage object itself.
-- This joins metadata.legacy.fieldTakeoff.photos[].storagePath against
-- storage.objects and writes the owner back onto each photo ref.
--
-- Schedule-item photos already carry uploadedBy (stamped server-side by
-- crew_append_schedule_item_photo), so they need no backfill.
--
-- Only touches photo objects that have a storagePath and no uploadedByUserId,
-- and rebuilds nothing else in the blob. Projects with no field photos are
-- skipped entirely by the WHERE clause.

BEGIN;

WITH owners AS (
  SELECT
    o.name AS storage_path,
    COALESCE(o.owner, NULLIF(o.owner_id, '')::uuid) AS uploader
  FROM storage.objects o
  WHERE o.bucket_id = 'drywall-field-photos'
),
rebuilt AS (
  SELECT
    p.id AS project_id,
    jsonb_agg(
      CASE
        WHEN photo ? 'uploadedByUserId'
          OR NULLIF(photo->>'storagePath', '') IS NULL
          OR owners.uploader IS NULL
        THEN photo
        ELSE photo || jsonb_build_object('uploadedByUserId', owners.uploader::text)
      END
      ORDER BY ord
    ) AS photos
  FROM public.projects p
  CROSS JOIN LATERAL jsonb_array_elements(
    p.metadata->'legacy'->'fieldTakeoff'->'photos'
  ) WITH ORDINALITY AS t(photo, ord)
  LEFT JOIN owners ON owners.storage_path = photo->>'storagePath'
  WHERE jsonb_typeof(p.metadata->'legacy'->'fieldTakeoff'->'photos') = 'array'
    AND jsonb_array_length(p.metadata->'legacy'->'fieldTakeoff'->'photos') > 0
  GROUP BY p.id
)
UPDATE public.projects p
SET metadata = jsonb_set(
      p.metadata,
      '{legacy,fieldTakeoff,photos}',
      rebuilt.photos,
      false
    )
FROM rebuilt
WHERE p.id = rebuilt.project_id
  AND rebuilt.photos IS DISTINCT FROM p.metadata->'legacy'->'fieldTakeoff'->'photos';

COMMIT;

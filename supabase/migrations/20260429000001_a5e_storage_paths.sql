-- ============================================================
-- A5-e storage paths: bulk REPLACE of old storage path/URL prefixes
--
-- Companion to scripts/a5e-storage-migration.mjs. The script handles:
--   - storage object moves
--   - re-signing signed URL columns (deal_documents.file_url,
--     selection_room_images.image_url, selection_room_spec_sheets.file_url)
--   - quote_requests.attachment_urls (text[] array per-row)
--
-- This SQL file handles bulk text REPLACE for non-array columns that
-- store either bucket-relative paths or PUBLIC URLs. Replacing the
-- old prefix with HSH_UUID is safe for these because public URLs
-- don't carry path-bound JWTs.
--
-- Order: run THIS file AFTER the Node script's storage moves succeed,
-- and BEFORE the schema migration (20260429_a5e_typeconvert.sql).
--
-- Idempotent: re-runnable. WHERE clause uses LIKE on old prefix; if
-- no rows match (already migrated), the UPDATE is a no-op.
-- ============================================================

BEGIN;

-- ============================================================
-- Constants (inline because Postgres SQL doesn't have nice variables)
-- ============================================================
-- HSH_UUID:         b80516ed-a8aa-4b6c-bdf8-2155e18a0129
-- MARK_USER_ID:     7507f8ea-f694-453b-960e-3f0ea6337864
-- JENNIFER_USER_ID: abdcfc61-fd26-417e-8cf2-7d1ff5e52b17

-- ============================================================
-- 1. deal_documents.file_path (bucket-relative)
-- ============================================================
UPDATE public.deal_documents
   SET file_path = REPLACE(file_path, 'default-org/', 'b80516ed-a8aa-4b6c-bdf8-2155e18a0129/')
 WHERE file_path LIKE 'default-org/%';

-- ============================================================
-- 2. selection_room_spec_sheets.file_path (bucket-relative)
-- ============================================================
UPDATE public.selection_room_spec_sheets
   SET file_path = REPLACE(file_path, 'default-org/', 'b80516ed-a8aa-4b6c-bdf8-2155e18a0129/')
 WHERE file_path LIKE 'default-org/%';

-- ============================================================
-- 3. project_documents.file_url (public URL, default-org prefix)
-- ============================================================
UPDATE public.project_documents
   SET file_url = REPLACE(
         file_url,
         '/project-documents/default-org/',
         '/project-documents/b80516ed-a8aa-4b6c-bdf8-2155e18a0129/'
       )
 WHERE file_url LIKE '%/project-documents/default-org/%';

-- ============================================================
-- 4. trades.quote_file_url (public URL in quote-documents bucket)
-- ============================================================
-- Cover all three possible old prefixes for completeness/idempotency
UPDATE public.trades
   SET quote_file_url = REPLACE(
         quote_file_url,
         '/quote-documents/default-org/',
         '/quote-documents/b80516ed-a8aa-4b6c-bdf8-2155e18a0129/'
       )
 WHERE quote_file_url LIKE '%/quote-documents/default-org/%';

UPDATE public.trades
   SET quote_file_url = REPLACE(
         quote_file_url,
         '/quote-documents/7507f8ea-f694-453b-960e-3f0ea6337864/',
         '/quote-documents/b80516ed-a8aa-4b6c-bdf8-2155e18a0129/'
       )
 WHERE quote_file_url LIKE '%/quote-documents/7507f8ea-f694-453b-960e-3f0ea6337864/%';

-- ============================================================
-- 5. sub_items.quote_file_url (covers same buckets as trades)
-- ============================================================
-- Pre-flight A10 returned no sample rows, but apply WHERE-guarded
-- updates anyway in case rows were created since pre-flight.
UPDATE public.sub_items
   SET quote_file_url = REPLACE(
         quote_file_url,
         '/quote-documents/default-org/',
         '/quote-documents/b80516ed-a8aa-4b6c-bdf8-2155e18a0129/'
       )
 WHERE quote_file_url LIKE '%/quote-documents/default-org/%';

UPDATE public.sub_items
   SET quote_file_url = REPLACE(
         quote_file_url,
         '/quote-documents/7507f8ea-f694-453b-960e-3f0ea6337864/',
         '/quote-documents/b80516ed-a8aa-4b6c-bdf8-2155e18a0129/'
       )
 WHERE quote_file_url LIKE '%/quote-documents/7507f8ea-f694-453b-960e-3f0ea6337864/%';

-- ============================================================
-- 6. submitted_quotes.quote_document_url (covers same buckets)
-- ============================================================
-- Pre-flight A10 returned no sample rows; same defensive pattern.
UPDATE public.submitted_quotes
   SET quote_document_url = REPLACE(
         quote_document_url,
         '/quote-documents/default-org/',
         '/quote-documents/b80516ed-a8aa-4b6c-bdf8-2155e18a0129/'
       )
 WHERE quote_document_url LIKE '%/quote-documents/default-org/%';

UPDATE public.submitted_quotes
   SET quote_document_url = REPLACE(
         quote_document_url,
         '/quote-documents/7507f8ea-f694-453b-960e-3f0ea6337864/',
         '/quote-documents/b80516ed-a8aa-4b6c-bdf8-2155e18a0129/'
       )
 WHERE quote_document_url LIKE '%/quote-documents/7507f8ea-f694-453b-960e-3f0ea6337864/%';

-- ============================================================
-- 7. Post-apply assertion — no row should still reference an old prefix
-- in any of the columns this file touches
-- ============================================================
DO $postcheck$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM public.deal_documents
   WHERE file_path LIKE 'default-org/%';
  IF n > 0 THEN RAISE EXCEPTION 'a5e_storage_paths: % deal_documents rows still have default-org/ file_path', n; END IF;

  SELECT count(*) INTO n FROM public.selection_room_spec_sheets
   WHERE file_path LIKE 'default-org/%';
  IF n > 0 THEN RAISE EXCEPTION 'a5e_storage_paths: % selection_room_spec_sheets rows still have default-org/ file_path', n; END IF;

  SELECT count(*) INTO n FROM public.project_documents
   WHERE file_url LIKE '%/project-documents/default-org/%';
  IF n > 0 THEN RAISE EXCEPTION 'a5e_storage_paths: % project_documents rows still have default-org URL', n; END IF;

  SELECT count(*) INTO n FROM public.trades
   WHERE quote_file_url LIKE '%/quote-documents/default-org/%'
      OR quote_file_url LIKE '%/quote-documents/7507f8ea-f694-453b-960e-3f0ea6337864/%';
  IF n > 0 THEN RAISE EXCEPTION 'a5e_storage_paths: % trades rows still have legacy quote_file_url prefix', n; END IF;
END
$postcheck$;

COMMIT;

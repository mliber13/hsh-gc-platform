-- quote-documents stops being readable by anyone holding the link.
--
-- The bucket is PUBLIC, so `getPublicUrl` handed back a URL that downloads the file with no
-- sign-in and no permission check. That URL was then stored on the trade and rendered into
-- the page as an href, where it can escape through a screenshot, browser history or a
-- forwarded email. Nothing has leaked; this closes a door that has been open (P1-SEC-6).
--
-- The part that makes this more than a flag flip, and the reason it could not just be done
-- in the Dashboard: **there is no authenticated SELECT policy on this bucket.** The previous
-- storage migration says so in its own comment —
--
--     -- ---- quote-documents (qd_*) — 3 policies (SELECT handled by qd_public_select) ----
--
-- Reads work today ONLY because the bucket is public. Setting `public = false` without
-- adding that policy first would break every read at once: the three trades carrying a quote
-- PDF, and the client-quote download, which calls `.download()` and needs SELECT just the
-- same. So the order here is add, then revoke, then flip — in one transaction, so no window
-- exists where the bucket is private and unreadable.
--
-- Measured before writing this: 21 objects, 6.6 MB. Fourteen are `quote-drawings-*` from the
-- vendor RFQ chain deleted in batch 1C, one is a 0-byte smoke test and one is a `temp-`
-- leftover. Four subcontractor PDFs and one client quote are live. Stored references: three
-- rows in `trades.quote_file_url` (full public URLs, all three objects present) and one in
-- `client_quotes.sent_pdf_url` (already a bare path). The application reads both shapes.
--
-- Dead objects are NOT deleted here. Removing stored files is irreversible and they are
-- inert once the bucket is private — the same call batch 1C made for the RFQ tables.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The SELECT policy this bucket never had
-- ---------------------------------------------------------------------------
-- Same org-scoped shape as every other private bucket here: the first path segment is the
-- organization id, which `uploadQuotePDF` and `clientQuoteService` both already write.
DROP POLICY IF EXISTS qd_auth_select_org ON storage.objects;
CREATE POLICY qd_auth_select_org ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'quote-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- 2. Remove the anonymous read
-- ---------------------------------------------------------------------------
-- Named variants across 006, 017 and the fixed bucket migration, so every spelling is
-- dropped rather than assuming which one the live project ended up with.
DROP POLICY IF EXISTS qd_public_select ON storage.objects;
DROP POLICY IF EXISTS "Public can view quote documents" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for quote documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view quote documents" ON storage.objects;

-- ---------------------------------------------------------------------------
-- 3. Flip the bucket
-- ---------------------------------------------------------------------------
UPDATE storage.buckets SET public = false WHERE id = 'quote-documents';

-- ---------------------------------------------------------------------------
-- Verification — fail loudly rather than leaving the bucket unreadable
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_public boolean;
  v_select_policies int;
BEGIN
  SELECT public INTO v_public FROM storage.buckets WHERE id = 'quote-documents';
  IF v_public IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'quote-documents is still public (got %)', v_public;
  END IF;

  SELECT count(*) INTO v_select_policies
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'qd_auth_select_org';

  IF v_select_policies <> 1 THEN
    RAISE EXCEPTION
      'qd_auth_select_org missing — a private bucket with no SELECT policy is unreadable';
  END IF;

  -- The objects themselves must still be there; this migration touches no file.
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id = 'quote-documents') = 0 THEN
    RAISE EXCEPTION 'quote-documents has no objects — expected 21';
  END IF;

  RAISE NOTICE 'quote_documents_private: OK — private, org-scoped SELECT in place, % objects intact',
    (SELECT count(*) FROM storage.objects WHERE bucket_id = 'quote-documents');
END
$verify$;

COMMIT;

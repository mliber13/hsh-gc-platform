# Storage Bucket Setup (Phase A3)

This document is the single source of truth for storage bucket setup and RLS policies.

## Scope

Configure these buckets in Supabase Dashboard:

- `quote-documents`
- `quote-attachments`
- `project-documents`
- `selection-images`
- `deal-documents`

## Important Notes

- Storage buckets must be created in the Supabase Dashboard (not via SQL migrations).
- Use exact bucket names (hyphenated).
- All private buckets rely on file paths that start with `{organization_id}/...`.
- `quote-documents` and `quote-attachments` both require vendor-facing public read for the quote flow.

## Flow to Bucket Mapping

- RFQ creation attachments and drawings (`quoteService.ts` uses `.from('quote-attachments')`): `quote-attachments`
- Vendor-submitted quote documents (`submitQuote` uses `.from('quote-documents')`): `quote-documents`
- Project document management: `project-documents`
- Selection room images: `selection-images`
- Deal document management/share: `deal-documents`

## 1) Create or Verify Buckets

In Supabase Dashboard:

1. Go to `Storage` -> `Buckets`.
2. Create each bucket if missing.
3. Use the following settings:

### `quote-documents`

- Public bucket: `Yes`
- File size limit: `50 MB`
- Allowed MIME types:
  - `application/pdf`
  - `image/jpeg`
  - `image/jpg`
  - `image/png`
  - `application/zip`

### `quote-attachments`

- Public bucket: `Yes`
- File size limit: `50 MB`
- Allowed MIME types:
  - `application/pdf`
  - `image/jpeg`
  - `image/jpg`
  - `image/png`
  - `application/zip`

### `project-documents`

- Public bucket: `No` (private)
- File size limit: `100 MB`
- Allowed MIME types:
  - `application/pdf`
  - `application/msword`
  - `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - `application/vnd.ms-excel`
  - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `image/jpeg`
  - `image/jpg`
  - `image/png`
  - `image/gif`
  - `image/webp`
  - `application/zip`
  - `application/x-zip-compressed`
  - `text/plain`
  - `text/csv`

### `selection-images`

- Public bucket: `No` (private)
- File size limit: `10 MB`
- Allowed MIME types:
  - `image/jpeg`
  - `image/png`
  - `image/webp`
  - `image/gif`

### `deal-documents`

- Public bucket: `No` (private)
- File size limit: `50 MB`
- Allowed MIME types:
  - `application/pdf`
  - `application/msword`
  - `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - `application/vnd.ms-excel`
  - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `image/jpeg`
  - `image/jpg`
  - `image/png`
  - `image/gif`
  - `image/webp`
  - `application/zip`
  - `application/x-zip-compressed`
  - `text/plain`
  - `text/csv`

## 2) Add RLS Policies for Each Bucket

In Supabase Dashboard:

1. Go to `Storage` -> `Policies`.
2. Select a bucket.
3. Add four policies: `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
4. Use target roles per bucket policy definitions below.

Use the SQL policy bodies below.

### `quote-documents`

```sql
-- SELECT
bucket_id = 'quote-documents'
```

```sql
-- INSERT / UPDATE / DELETE
bucket_id = 'quote-documents' AND
(storage.foldername(name))[1] IN (
  SELECT organization_id FROM profiles WHERE id = auth.uid()
)
```

- SELECT target roles: `anon`, `authenticated`
- INSERT/UPDATE/DELETE target roles: `authenticated`

### `quote-attachments`

```sql
-- SELECT
bucket_id = 'quote-attachments'
```

```sql
-- INSERT / UPDATE / DELETE
bucket_id = 'quote-attachments' AND
(storage.foldername(name))[1] IN (
  SELECT organization_id FROM profiles WHERE id = auth.uid()
)
```

- SELECT target roles: `anon`, `authenticated`
- INSERT/UPDATE/DELETE target roles: `authenticated`

### `project-documents`

```sql
-- SELECT
bucket_id = 'project-documents' AND
(storage.foldername(name))[1] IN (
  SELECT organization_id FROM profiles WHERE id = auth.uid()
)
```

```sql
-- INSERT / UPDATE / DELETE
bucket_id = 'project-documents' AND
(storage.foldername(name))[1] IN (
  SELECT organization_id FROM profiles WHERE id = auth.uid()
)
```

### `selection-images`

```sql
-- SELECT / INSERT / UPDATE / DELETE
bucket_id = 'selection-images' AND
EXISTS (
  SELECT 1 FROM profiles
  WHERE id = auth.uid()
  AND organization_id = (storage.foldername(name))[1]
)
```

### `deal-documents`

```sql
-- SELECT
bucket_id = 'deal-documents' AND
(storage.foldername(name))[1] IN (
  SELECT organization_id FROM profiles WHERE id = auth.uid()
)
```

```sql
-- INSERT / UPDATE / DELETE
bucket_id = 'deal-documents' AND
(storage.foldername(name))[1] IN (
  SELECT organization_id FROM profiles WHERE id = auth.uid()
)
```

## 3) Verify End-to-End

For each bucket:

1. Upload a test file from the app.
2. Confirm file path starts with your organization ID.
3. Download/view as same user.
4. Delete the file.
5. Validate users from another organization cannot access it.
6. Full cross-org isolation verification is blocked until A5 migrates `default-org` to UUID organization IDs.

If any test fails, re-check:

- Exact bucket name
- Policy target roles
- Policy SQL copied exactly
- User has a `profiles` row with `organization_id`

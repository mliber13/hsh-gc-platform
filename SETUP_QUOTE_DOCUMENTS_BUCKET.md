# Setup Quote Documents Storage Bucket

## The Problem

The `quote-documents` storage bucket doesn't exist, causing "Bucket not found" errors when viewing drawings.

## About Existing Quote Requests

**Yes, existing quote requests won't have drawings.** If you sent quote requests before the bucket was created:
- The upload would have failed silently
- The `drawingsUrl` field would be `null` or empty
- Those requests won't have accessible drawings

**Solution:** You'll need to resend those quote requests after the bucket is set up, or manually upload the drawings.

## Setup Steps

### Step 1: Create the Bucket (SQL Migration)

Run the migration `017_create_quote_documents_bucket_public.sql` in Supabase SQL Editor.

This creates the bucket but **cannot set up storage policies** (requires service role permissions).

### Step 2: Set Up Storage Policies (Supabase Dashboard)

After creating the bucket, set up policies through the dashboard:

1. **Go to Supabase Dashboard** → **Storage** → **Policies**
2. **Select the `quote-documents` bucket**
3. **Add these 4 policies:**

#### Policy 1: Public Read (for vendors)
- **Policy name:** `Public can view quote documents`
- **Allowed operation:** `SELECT`
- **Policy definition:**
  ```sql
  bucket_id = 'quote-documents'
  ```
- **Target roles:** `anon`, `authenticated`

#### Policy 2: Authenticated Upload
- **Policy name:** `Authenticated users can upload quote documents`
- **Allowed operation:** `INSERT`
- **Policy definition:**
  ```sql
  bucket_id = 'quote-documents' AND auth.uid() IS NOT NULL
  ```
- **Target roles:** `authenticated`

#### Policy 3: Authenticated Update
- **Policy name:** `Authenticated users can update quote documents`
- **Allowed operation:** `UPDATE`
- **Policy definition:**
  ```sql
  bucket_id = 'quote-documents' AND auth.uid() IS NOT NULL
  ```
- **Target roles:** `authenticated`

#### Policy 4: Authenticated Delete
- **Policy name:** `Authenticated users can delete quote documents`
- **Allowed operation:** `DELETE`
- **Policy definition:**
  ```sql
  bucket_id = 'quote-documents' AND auth.uid() IS NOT NULL
  ```
- **Target roles:** `authenticated`

### Step 3: Verify

1. Create a new quote request with a drawing
2. Check that the upload succeeds
3. Click "View Drawings" - it should work
4. Test as a vendor (unauthenticated) - should be able to view

## Alternative: Create Bucket via Dashboard

If the SQL migration doesn't work, create the bucket manually:

1. Go to **Storage** → **Buckets** → **New Bucket**
2. **Bucket name:** `quote-documents`
3. **Public bucket:** ✅ **Yes** (vendors need access)
4. **File size limit:** 50 MB
5. **Allowed MIME types:** `application/pdf, image/jpeg, image/png, image/jpg, application/zip`
6. Click **Create**
7. Then set up the policies as described above

## After Setup

- ✅ New quote requests will upload drawings successfully
- ✅ Vendors can view drawings without authentication
- ⚠️ Old quote requests (sent before bucket existed) won't have drawings - resend them


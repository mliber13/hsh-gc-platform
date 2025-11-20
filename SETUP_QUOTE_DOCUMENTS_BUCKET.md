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

### ⚠️ IMPORTANT: Create Bucket via Dashboard (Not SQL)

**You cannot create storage buckets via SQL** - it requires service role permissions. You must use the Supabase Dashboard.

### Step 1: Check if Bucket Exists

1. Go to **Supabase Dashboard** → **Storage** → **Buckets**
2. Look for `quote-documents` bucket

**If it exists:** Skip to Step 2 (verify configuration)  
**If it doesn't exist:** Create it (see below)

### Create the Bucket (if it doesn't exist)

1. Click **New Bucket**
2. Fill in the form:
   - **Name:** `quote-documents`
   - **Public bucket:** ✅ **Yes** (vendors need access without authentication)
   - **File size limit:** `50 MB` (or leave default)
   - **Allowed MIME types:** `application/pdf, image/jpeg, image/png, image/jpg, application/zip`
3. Click **Create bucket**

### Step 2: Verify Bucket Configuration

If the bucket already exists, check these settings:

1. Click on the `quote-documents` bucket
2. Verify:
   - ✅ **Public bucket:** Should be **ON/YES**
   - ✅ **File size limit:** At least 50 MB
   - ✅ **Allowed MIME types:** Includes PDF and images

If any are wrong, you can edit the bucket settings.

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

## Why SQL Migration Doesn't Work

Storage buckets require **service role** permissions to create via SQL. Regular database users don't have permission to insert into `storage.buckets`. The Supabase Dashboard uses the service role, so it can create buckets.

**The SQL migration file is kept for documentation, but you must create the bucket through the Dashboard.**

## After Setup

- ✅ New quote requests will upload drawings successfully
- ✅ Vendors can view drawings without authentication
- ⚠️ Old quote requests (sent before bucket existed) won't have drawings - resend them


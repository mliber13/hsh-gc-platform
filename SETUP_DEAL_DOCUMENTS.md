# Setup Guide: Deal Documents Storage

This guide explains how to set up document storage for deals in the HSH GC Platform.

## Overview

The deal documents feature allows you to store and manage documents for each deal, including:
- Proposals
- Contracts
- Plans and specifications
- Permits
- Financial documents
- Photos
- And more...

## Prerequisites

1. **Run the database migration**: The `deal_documents` table has already been created via migration `030_create_deal_documents.sql` ✅
2. **Supabase project access**: You need access to your Supabase Dashboard

## Step 1: Create the Storage Bucket

Storage buckets cannot be created via SQL - they must be created through the Supabase Dashboard.

1. Go to your **Supabase Dashboard** → **Storage** → **Buckets**
2. Click **"New bucket"**
3. Configure the bucket:
   - **Name**: `deal-documents`
   - **Public bucket**: ❌ **Unchecked** (private bucket - requires authentication)
   - **File size limit**: `52428800` (50 MB)
   - **Allowed MIME types**: Copy and paste the list below
4. Click **"Create bucket"**

### MIME Types (Copy and Paste):

```
application/pdf
application/msword
application/vnd.openxmlformats-officedocument.wordprocessingml.document
application/vnd.ms-excel
application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
image/jpeg
image/jpg
image/png
image/gif
image/webp
application/zip
application/x-zip-compressed
text/plain
text/csv
```

**Or as a comma-separated list (if your UI requires it):**
```
application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/jpg,image/png,image/gif,image/webp,application/zip,application/x-zip-compressed,text/plain,text/csv
```

## Step 2: Set Up Storage Policies

After creating the bucket, you need to set up Row Level Security (RLS) policies so users can only access documents from their organization.

1. Go to **Supabase Dashboard** → **Storage** → **Policies** → Select `deal-documents` bucket
2. Click **"New Policy"** for each of the following:

### SELECT Policy (View/Download)

- **Policy name**: "Users can view deal documents in their organization"
- **Allowed operation**: `SELECT`
- **Policy definition** (paste this EXACT text):
  ```sql
  bucket_id = 'deal-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  )
  ```
- **Target roles**: `authenticated` ✅

### INSERT Policy (Upload Documents)

- **Policy name**: "Users can upload deal documents in their organization"
- **Allowed operation**: `INSERT`
- **Policy definition** (paste this EXACT text):
  ```sql
  bucket_id = 'deal-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  )
  ```
- **Target roles**: `authenticated` ✅

### UPDATE Policy (Update Documents)

- **Policy name**: "Users can update deal documents in their organization"
- **Allowed operation**: `UPDATE`
- **Policy definition** (paste this EXACT text):
  ```sql
  bucket_id = 'deal-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  )
  ```
- **Target roles**: `authenticated` ✅

### DELETE Policy (Delete Documents)

- **Policy name**: "Users can delete deal documents in their organization"
- **Allowed operation**: `DELETE`
- **Policy definition** (paste this EXACT text):
  ```sql
  bucket_id = 'deal-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  )
  ```
- **Target roles**: `authenticated` ✅

**Important Notes:**
- ✅ **Yes, you MUST set Target roles to `authenticated`** for all policies
- The policy checks the file path structure: `{organization_id}/{deal_id}/{filename}`
- `storage.foldername(name)[1]` extracts the organization_id from the file path
- Make sure to use the exact bucket name: `'deal-documents'` (with hyphen)

## Step 3: Test the Setup

1. **Navigate to Deal Pipeline**: Go to a deal in your application
2. **Upload a test document**: Try uploading a PDF or image
3. **Verify upload**: Check that the document appears in the list
4. **Test download**: Click to view/download the document
5. **Test organization isolation**: If you have multiple organizations, verify users from one organization cannot see documents from another

## File Organization

Documents are stored in Supabase Storage with the following structure:
```
deal-documents/
  {organization_id}/
    {deal_id}/
      {timestamp}-{filename}
```

This ensures:
- Organization-level isolation
- Deal-level organization
- Unique filenames (timestamp prevents conflicts)

## Document Types

The following document types are supported:
- **Proposal** - Initial proposals for deals
- **Contract** - Contracts and agreements
- **Plan** - Architectural plans and drawings
- **Specification** - Technical specifications
- **Permit** - Permits and approvals
- **Financial Document** - Budgets, cost estimates, financial statements
- **Photo** - Photos related to the deal
- **Other** - Any other document type

## Features

- ✅ Upload documents with metadata (type, description, category, tags)
- ✅ View documents grouped by type
- ✅ Download documents
- ✅ Edit document metadata
- ✅ Delete documents
- ✅ Organization-level security (users only see their organization's documents)
- ✅ Automatic file organization by deal

## Troubleshooting

### "Cannot upload files in offline mode"
- Make sure you're logged in and Supabase is configured
- Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in your `.env` file

### "Error uploading document"
- Check that the storage bucket exists and is named `deal-documents`
- Verify storage policies are set up correctly
- Check file size (max 50 MB)
- Verify file type is allowed

### "Permission denied" errors
- Verify RLS policies are set up correctly
- Check that the user has a `user_profiles` record with an `organization_id`
- Verify the user is authenticated

### Documents not showing
- Check browser console for errors
- Verify the `deal_documents` table exists and has data
- Check that RLS policies allow SELECT operations

## Next Steps

After setup is complete, you can:
1. Start uploading deal documents
2. Organize documents by type, category, and tags
3. Link documents to specific deals in your pipeline

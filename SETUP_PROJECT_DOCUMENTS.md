# Setup Guide: Project Documents Storage

This guide explains how to set up document storage for projects in the HSH GC Platform.

## Overview

The project documents feature allows you to store and manage documents for each project, including:
- Subcontractor agreements
- Scope of work sign-offs
- Contracts
- Plans and specifications
- Permits
- Invoices
- And more...

## Prerequisites

1. **Run the database migration**: The `project_documents` table has already been created via migration `019_create_project_documents.sql`
2. **Supabase project access**: You need access to your Supabase Dashboard

## Step 1: Create the Storage Bucket

Storage buckets cannot be created via SQL - they must be created through the Supabase Dashboard.

1. Go to your **Supabase Dashboard** → **Storage** → **Buckets**
2. Click **"New bucket"**
3. Configure the bucket:
   - **Name**: `project-documents`
   - **Public bucket**: ❌ **Unchecked** (private bucket - requires authentication)
   - **File size limit**: `104857600` (100 MB)
   - **Allowed MIME types**: 
     - `application/pdf` (PDFs - contracts, agreements, plans)
     - `application/msword` (Word .doc files)
     - `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (Word .docx files)
     - `application/vnd.ms-excel` (Excel .xls files)
     - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (Excel .xlsx files)
     - `image/jpeg`, `image/jpg` (JPEG images)
     - `image/png` (PNG images)
     - `image/gif` (GIF images)
     - `image/webp` (WebP images)
     - `application/zip`, `application/x-zip-compressed` (ZIP archives)
     - `text/plain` (Text files)
     - `text/csv` (CSV files)
4. Click **"Create bucket"**

## Step 2: Set Up Storage Policies

After creating the bucket, you need to set up Row Level Security (RLS) policies so users can only access documents from their organization.

1. Go to **Supabase Dashboard** → **Storage** → **Policies** → Select `project-documents` bucket
2. Click **"New Policy"** for each of the following:

### SELECT Policy (View Documents)

- **Policy name**: "Users can view documents in their organization"
- **Allowed operation**: `SELECT`
- **Policy definition**:
  ```sql
  bucket_id = 'project-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  )
  ```
- **Target roles**: `authenticated`

### INSERT Policy (Upload Documents)

- **Policy name**: "Users can upload documents in their organization"
- **Allowed operation**: `INSERT`
- **Policy definition**:
  ```sql
  bucket_id = 'project-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  )
  ```
- **Target roles**: `authenticated`

### UPDATE Policy (Update Documents)

- **Policy name**: "Users can update documents in their organization"
- **Allowed operation**: `UPDATE`
- **Policy definition**:
  ```sql
  bucket_id = 'project-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  )
  ```
- **Target roles**: `authenticated`

### DELETE Policy (Delete Documents)

- **Policy name**: "Users can delete documents in their organization"
- **Allowed operation**: `DELETE`
- **Policy definition**:
  ```sql
  bucket_id = 'project-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  )
  ```
- **Target roles**: `authenticated`

## Step 3: Verify Setup

1. **Test Upload**: 
   - Go to a project in the app
   - Click "View Project Documents"
   - Try uploading a test document
   - Verify it appears in the list

2. **Test Access**:
   - Verify you can view, download, edit, and delete documents
   - Verify documents are organized by type

3. **Test Organization Isolation**:
   - If you have multiple organizations, verify users from one organization cannot see documents from another

## File Organization

Documents are stored in Supabase Storage with the following structure:
```
project-documents/
  {organization_id}/
    {project_id}/
      {timestamp}-{filename}
```

This ensures:
- Organization-level isolation
- Project-level organization
- Unique filenames (timestamp prevents conflicts)

## Document Types

The following document types are supported:
- Contract
- Plan
- Specification
- Permit
- Invoice
- Change Order
- RFI
- Submittal
- Inspection
- Warranty
- Photo
- **Subcontractor Agreement** (new)
- **Scope of Work Sign-off** (new)
- Other

## Features

- ✅ Upload documents with metadata (type, description, category, tags)
- ✅ View documents grouped by type
- ✅ Download documents
- ✅ Edit document metadata
- ✅ Delete documents
- ✅ Organization-level security (users only see their organization's documents)
- ✅ Automatic file organization by project

## Troubleshooting

### "Cannot upload files in offline mode"
- Make sure you're logged in and Supabase is configured
- Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in your `.env` file

### "Error uploading document"
- Check that the storage bucket exists and is named `project-documents`
- Verify storage policies are set up correctly
- Check file size (max 100 MB)
- Verify file type is allowed

### "Permission denied" errors
- Verify RLS policies are set up correctly
- Check that the user has a `user_profiles` record with an `organization_id`
- Verify the user is authenticated

### Documents not showing
- Check browser console for errors
- Verify the `project_documents` table exists and has data
- Check that RLS policies allow SELECT operations

## Next Steps

After setup is complete, you can:
1. Start uploading project documents
2. Organize documents by type, category, and tags
3. Link documents to specific projects
4. Share documents with team members in your organization


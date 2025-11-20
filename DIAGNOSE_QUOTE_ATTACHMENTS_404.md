# Diagnose Quote Attachments 404 Error

## The Problem
You're getting a 404 when clicking "View Drawings" on a quote request. This likely means:
1. The quote request was created **before** the `quote-attachments` bucket existed
2. The file upload failed silently
3. A bad URL was stored in the database

## Quick Diagnosis

### Step 1: Check Browser Console
1. Open your browser's Developer Tools (F12)
2. Go to the **Console** tab
3. Create a **new quote request** with drawings
4. Look for any error messages about file uploads

You should see either:
- ✅ `"Drawings uploaded successfully: [URL]"` - Upload worked!
- ❌ `"Failed to upload drawings file: [error]"` - Upload failed

### Step 2: Check Database
1. Go to **Supabase Dashboard** → **Table Editor** → `quote_requests`
2. Find the quote request that's giving you 404
3. Check the `drawings_url` column:
   - If it's `null` → The upload failed (bucket didn't exist)
   - If it has a URL → Check if the URL is correct

### Step 3: Test the URL Directly
If there's a URL in `drawings_url`:
1. Copy the URL
2. Paste it in a new browser tab
3. If it gives 404, the file doesn't exist in the bucket

### Step 4: Check Storage Bucket
1. Go to **Storage** → **Buckets** → `quote-attachments`
2. Click on the bucket
3. Check if there are any files uploaded
4. If empty, the uploads are failing

## Solution

### For NEW Quote Requests
Now that the bucket exists and is configured correctly:
1. Create a **new quote request** with drawings
2. Check the browser console for upload success
3. Test the "View Drawings" link

### For EXISTING Quote Requests
If you have quote requests created before the bucket existed:
1. You'll need to **re-send** those quote requests with the drawings
2. OR manually upload the files to the bucket and update the database

## Manual Fix (If Needed)

If you need to fix an existing quote request:

1. **Upload the file manually:**
   - Go to **Storage** → `quote-attachments`
   - Upload the file to the correct path: `[org_id]/[project_id]/quote-drawings-[token].[ext]`

2. **Get the public URL:**
   - Click on the uploaded file
   - Copy the public URL

3. **Update the database:**
   - Go to **Table Editor** → `quote_requests`
   - Find the row with the matching `token`
   - Update `drawings_url` with the public URL

## Still Not Working?

If new quote requests still fail:
1. Check browser console for specific error messages
2. Verify the bucket name is exactly `quote-attachments` (lowercase, hyphen)
3. Verify "Public bucket" is ON
4. Verify the SELECT policy exists for `anon` role


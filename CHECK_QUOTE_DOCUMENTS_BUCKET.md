# Check Quote Documents Bucket Configuration

## The Bucket Exists - Now Check Configuration

Since the bucket already exists, we need to verify it's set up correctly.

## Step 1: Verify Bucket Settings

1. Go to **Supabase Dashboard** → **Storage** → **Buckets**
2. Click on the `quote-documents` bucket
3. Check these settings:
   - ✅ **Public bucket:** Should be **ON/YES** (vendors need access)
   - ✅ **File size limit:** Should be at least 50 MB
   - ✅ **Allowed MIME types:** Should include `application/pdf`, `image/jpeg`, `image/png`, `image/jpg`

If any of these are wrong, you can edit the bucket settings.

## Step 2: Check Storage Policies

1. Go to **Storage** → **Policies**
2. Select the `quote-documents` bucket
3. You should see 4 policies:

### Required Policies:

1. **Public Read Policy** (for vendors)
   - Name: Something like "Public can view" or "Public read"
   - Operation: SELECT
   - Should allow `anon` role

2. **Authenticated Upload Policy**
   - Name: Something like "Authenticated upload" or "Users can upload"
   - Operation: INSERT
   - Should allow `authenticated` role

3. **Authenticated Update Policy**
   - Operation: UPDATE
   - Should allow `authenticated` role

4. **Authenticated Delete Policy**
   - Operation: DELETE
   - Should allow `authenticated` role

## Step 3: If Policies Are Missing

If you don't see a public read policy, add it:

1. Click **New Policy** in the Policies tab
2. Choose **For full customization**
3. Policy name: `Public can view quote documents`
4. Allowed operation: `SELECT`
5. Policy definition:
   ```sql
   bucket_id = 'quote-documents'
   ```
6. Target roles: Check both `anon` and `authenticated`
7. Click **Save**

## Step 4: Test

1. Create a new quote request with a drawing
2. Check if the upload succeeds
3. Click "View Drawings" - should work now
4. Test as a vendor (unauthenticated) - should be able to view

## Common Issues

### Issue: "Bucket not found" error
- **Cause:** Bucket exists but policies aren't set up
- **Fix:** Add the public read policy (Step 3)

### Issue: "Permission denied" when uploading
- **Cause:** Missing INSERT policy
- **Fix:** Add authenticated upload policy

### Issue: Can upload but can't view
- **Cause:** Bucket is private or missing SELECT policy
- **Fix:** Make bucket public OR add public SELECT policy


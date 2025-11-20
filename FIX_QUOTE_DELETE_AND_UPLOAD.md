# Fix: Quote Request Deletion & Upload Issues

## Issue 1: Can't Delete Quote Requests ✅ FIXED

### Problem
The RLS (Row Level Security) policy for `quote_requests` was missing DELETE and UPDATE policies, so authenticated users couldn't delete their own quote requests.

### Solution
Added DELETE and UPDATE policies to the migration file. You need to run the updated migration.

### What to Do
1. Go to **Supabase Dashboard** → **SQL Editor**
2. Run the updated migration: `supabase/migrations/016_allow_public_quote_request_access.sql`
3. Or manually add these policies:

**Policy: Users can update own quote requests**
- Table: `quote_requests`
- Operation: `UPDATE`
- Policy:
  ```sql
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id)
  ```

**Policy: Users can delete own quote requests**
- Table: `quote_requests`
- Operation: `DELETE`
- Policy:
  ```sql
  USING (auth.uid() = user_id)
  ```

### Test
After running the migration, try deleting a quote request - it should work now.

---

## Issue 2: Upload Still Failing (404 on Drawings)

### Possible Causes

#### 1. Missing INSERT Policy on Storage Bucket
Even though the bucket exists, you need an **INSERT policy** for authenticated users to upload files.

**Check:**
1. Go to **Storage** → **Policies** → Select `quote-attachments`
2. Look for a policy named "Authenticated users can upload quote attachments"
3. It should have:
   - **Operation:** `INSERT`
   - **Target roles:** `authenticated`
   - **Policy:** `bucket_id = 'quote-attachments' AND auth.uid() IS NOT NULL`

**If missing, add it:**
1. Click **New Policy** → **For full customization**
2. Fill in:
   - **Name:** `Authenticated users can upload quote attachments`
   - **Operation:** `INSERT`
   - **Policy:** `bucket_id = 'quote-attachments' AND auth.uid() IS NOT NULL`
   - **Target roles:** `authenticated`
3. Save

#### 2. Check Browser Console for Upload Errors
When creating a new quote request with drawings:
1. Open **Browser Console** (F12)
2. Look for error messages when uploading
3. You should see either:
   - ✅ `"Drawings uploaded successfully: [URL]"` - Success!
   - ❌ `"Failed to upload drawings file: [error]"` - Check the error message

#### 3. Verify File Path
The upload might be failing due to the file path structure. Check the console logs for:
- `"File path attempted: [path]"`
- The path should be: `[org_id or user_id]/[project_id]/quote-drawings-[token].[ext]`

#### 4. Check Database
1. Go to **Table Editor** → `quote_requests`
2. Find the quote request you just created
3. Check `drawings_url`:
   - If `null` → Upload failed
   - If it has a URL → Test the URL directly in browser

---

## Quick Diagnostic Steps

1. **Run the updated migration** (fixes deletion)
2. **Verify INSERT policy exists** on `quote-attachments` bucket
3. **Create a new quote request** with drawings
4. **Check browser console** for upload success/failure messages
5. **Check database** to see if `drawings_url` was saved
6. **Test the URL** directly if it exists

---

## Next Steps

After fixing both issues:
1. ✅ You should be able to delete quote requests
2. ✅ New quote requests should upload drawings successfully
3. ⚠️ Old quote requests (created before bucket existed) won't have drawings - you'll need to resend them


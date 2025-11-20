# Create Quote Documents Bucket - Step by Step

## The Situation

The system says the bucket exists, but you can't see it. This might mean:
- It was partially created
- It exists but is hidden/archived
- There's a naming conflict

## Solution: Create It Fresh

### Step 1: Check All Buckets

1. Go to **Supabase Dashboard** → **Storage** → **Buckets**
2. Look at the list - do you see ANY buckets?
3. Check if there's a bucket with a similar name (like `quote_documents` with underscore, or `quotedocuments`)

### Step 2: Try Creating with Exact Name

1. Click **New Bucket**
2. **Bucket name:** `quote-documents` (exactly this, with hyphen)
3. **Public bucket:** ✅ **YES** (this is critical!)
4. **File size limit:** `52428800` (50 MB in bytes) or just select 50 MB
5. **Allowed MIME types:** 
   ```
   application/pdf,image/jpeg,image/png,image/jpg,application/zip
   ```
   (comma-separated, no spaces)
6. Click **Create bucket**

### Step 3: If It Says "Already Exists"

If you get "Resources already exist" but can't see the bucket:

1. **Try a different name first** to test:
   - Name: `quote-docs-test`
   - Create it
   - If that works, the issue is with the specific name
   - Delete the test bucket

2. **Check if bucket is archived:**
   - Some Supabase interfaces hide archived buckets
   - Look for a "Show archived" or "All buckets" filter

3. **Use Supabase CLI** (if you have it):
   ```bash
   supabase storage create quote-documents --public
   ```

### Step 4: Alternative - Use Different Name

If `quote-documents` is truly stuck, we can update the code to use a different bucket name:

- `quote-drawings`
- `vendor-quote-docs`
- `quote-attachments`

Let me know if you want to go this route and I'll update the code.

## After Creating Successfully

Once the bucket is created and visible:

1. **Verify it's public:**
   - Click on the bucket
   - Check "Public bucket" is ON

2. **Add Storage Policies:**
   - Go to **Storage** → **Policies**
   - Select `quote-documents` bucket
   - Add the 4 policies as described in `SETUP_QUOTE_DOCUMENTS_BUCKET.md`

3. **Test:**
   - Create a new quote request with a drawing
   - Verify upload works
   - Test viewing as vendor


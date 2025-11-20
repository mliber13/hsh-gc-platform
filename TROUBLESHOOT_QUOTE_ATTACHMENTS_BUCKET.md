# Troubleshoot Quote Attachments Bucket 404 Error

## Quick Checks

### 1. Verify Bucket Name is Exact
- Go to **Storage** → **Buckets**
- Check the exact name - it must be `quote-attachments` (with hyphen, lowercase)
- If it's `quote_attachments` (underscore) or `Quote-Attachments` (capitalized), that's the problem

### 2. Check Bucket is Public
1. Click on the `quote-attachments` bucket
2. Verify **"Public bucket"** is **ON/YES**
3. If it's private, vendors can't access it

### 3. Check Storage Policies
1. Go to **Storage** → **Policies**
2. Select `quote-attachments` bucket
3. You should see at least a **SELECT** policy that allows `anon` role
4. If missing, add it (see below)

### 4. Test the Bucket Directly
Try accessing a file URL directly in your browser. If you have a file uploaded, the URL should look like:
```
https://[your-project].supabase.co/storage/v1/object/public/quote-attachments/[path]
```

If this gives 404, the bucket isn't public or doesn't exist.

## Fix: Add Public Read Policy

If the policy is missing:

1. **Storage** → **Policies** → Select `quote-attachments`
2. Click **"New Policy"** → **"For full customization"**
3. Fill in:
   - **Policy name:** `Public can view quote attachments`
   - **Allowed operation:** `SELECT`
   - **Policy definition:**
     ```sql
     bucket_id = 'quote-attachments'
     ```
   - **Target roles:** Check `anon` and `authenticated`
4. Click **Save**

## Alternative: Make Bucket Public

If policies aren't working, try making the bucket itself public:

1. Go to **Storage** → **Buckets**
2. Click on `quote-attachments`
3. Toggle **"Public bucket"** to **ON**
4. Save

## Still Not Working?

1. **Check the exact error** - what URL is it trying to access?
2. **Check browser console** - any additional error messages?
3. **Verify bucket exists** - can you see it in the list?
4. **Try uploading a test file** - does the upload work?


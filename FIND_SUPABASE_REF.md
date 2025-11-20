# How to Find Your Supabase Project Reference ID

## Method 1: Settings → General
1. Go to your Supabase Dashboard
2. Click on **Settings** (gear icon in the left sidebar)
3. Click on **General**
4. Look for:
   - **Reference ID** (this is what you need)
   - OR **Project ID**
   - OR **Project Reference**

## Method 2: From the URL
Your Supabase project URL looks like:
```
https://YOUR_PROJECT_REF.supabase.co
```

The part before `.supabase.co` is your Reference ID.

For example, if your URL is:
```
https://rvtdavpsvrhbktbxquzm.supabase.co
```

Then your Reference ID is: `rvtdavpsvrhbktbxquzm`

## Method 3: API Settings
1. Go to **Settings** → **API**
2. Look for **Project URL** or **Reference ID**
3. It's usually shown near the top of the page

## Method 4: From Your Code
If you already have Supabase configured in your app, check your `.env` file or `src/lib/supabase.ts`:
- Look for `VITE_SUPABASE_URL` or `SUPABASE_URL`
- The Reference ID is the part between `https://` and `.supabase.co`

Example:
```
VITE_SUPABASE_URL=https://rvtdavpsvrhbktbxquzm.supabase.co
```
Reference ID = `rvtdavpsvrhbktbxquzm`

## Once You Have It

Run:
```bash
supabase link --project-ref YOUR_REFERENCE_ID
```

Replace `YOUR_REFERENCE_ID` with the actual ID you found.








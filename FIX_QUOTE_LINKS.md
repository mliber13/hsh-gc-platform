# Fix for Quote Link 404 Errors

## What Was Wrong

When you sent quote request emails, the links in those emails were using `window.location.origin` to build the URL. This means:
- If you created the quote request from your local dev server (`localhost:5173`), the email links pointed to `localhost:5173/vendor-quote/...`
- When vendors clicked those links, they got 404 errors because they don't have your local server running

## What I Fixed

I updated the code to:
1. Use a configurable public URL (your production site URL) instead of whatever URL you happen to be on
2. Support both `/vendor-quote/` and `/quote/` routes (for backwards compatibility)
3. Make the routing work correctly for direct link access

## What You Need To Do

### Step 1: Set Environment Variable in Vercel

1. Go to your Vercel dashboard: https://vercel.com
2. Select your `hsh-gc-platform` project
3. Go to **Settings** → **Environment Variables**
4. Add a new variable:
   - **Name:** `VITE_PUBLIC_APP_URL`
   - **Value:** `https://hsh-gc-platform.vercel.app` (or your custom domain if you have one)
   - **Environment:** Select all (Production, Preview, Development)
5. Click **Save**

### Step 2: Redeploy

After adding the environment variable, Vercel will automatically redeploy. Or you can:
- Push a new commit to trigger a redeploy, OR
- Go to **Deployments** tab and click **Redeploy** on the latest deployment

### Step 3: Test It

1. After redeploy completes, create a new quote request from your production site
2. Check the email that gets sent - the link should now point to `https://hsh-gc-platform.vercel.app/vendor-quote/...`
3. Click the link - it should work!

## Optional: Custom Domain

If you have a custom domain (like `app.yourcompany.com`), use that instead:
- **Value:** `https://app.yourcompany.com`

## What About Old Quote Links?

The old quote links that were already sent will still have the wrong URL. You'll need to:
- Resend those quote requests (the resend function will now use the correct URL), OR
- Manually send new quote requests

## Summary

**The Problem:** Quote links in emails were pointing to localhost or wrong URLs  
**The Fix:** Code now uses a configurable production URL  
**What You Do:** Add `VITE_PUBLIC_APP_URL` environment variable in Vercel and redeploy  
**Result:** New quote emails will have correct links that work for vendors


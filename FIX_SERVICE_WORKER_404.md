# Fix for Service Worker 404 Errors

## What's Happening

You're seeing a 404 error for a hash like `035dbe3a3deb638af17d72d296d7a8a2f468deacaf5d804ae17893281a85b1f0`. This is your **service worker** (PWA cache) trying to fetch a resource from an old build that no longer exists.

## Quick Fix (For You Right Now)

### Option 1: Clear Browser Cache (Easiest)
1. Open your browser's Developer Tools (F12)
2. Go to the **Application** tab (Chrome) or **Storage** tab (Firefox)
3. Click **Clear storage** or **Clear site data**
4. Check all boxes and click **Clear site data**
5. Refresh the page

### Option 2: Unregister Service Worker
1. Open Developer Tools (F12)
2. Go to **Application** tab → **Service Workers**
3. Click **Unregister** next to your service worker
4. Refresh the page

## What I Fixed in the Code

I updated `vite.config.ts` to:
- ✅ Automatically clean up outdated caches
- ✅ Make the service worker update immediately
- ✅ Handle missing resources gracefully

## After You Deploy

Once you rebuild and redeploy:
1. The new service worker will automatically clean up old caches
2. Users will get the update automatically
3. The 404 errors should stop

## For Users Experiencing This

If vendors or other users see this error, they can:
1. **Hard refresh**: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. **Clear cache**: Settings → Clear browsing data → Cached images and files
3. The error should go away after the next app update

## Why This Happens

When you rebuild the app, Vite generates new file hashes. The old service worker still has the old hashes cached, so it tries to fetch files that don't exist anymore. The fix ensures old caches are cleaned up automatically.


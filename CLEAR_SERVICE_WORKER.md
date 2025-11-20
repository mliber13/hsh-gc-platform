# Clear Service Worker Cache - Fix 404 Errors

## The Problem

Your browser has an old service worker cached that's trying to fetch resources that no longer exist after the new deployment. This causes 404 errors.

## Solution: Clear Service Worker (Do This Now)

### Method 1: Browser DevTools (Recommended)

1. **Open Developer Tools** (F12)
2. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
3. In the left sidebar, click **Service Workers**
4. Find your service worker for `hsh-gc-platform.vercel.app`
5. Click **Unregister**
6. Go to **Storage** → **Clear site data**
7. Check all boxes and click **Clear site data**
8. **Close all tabs** with your app open
9. **Reopen** the app in a new tab

### Method 2: Hard Refresh

1. Close all tabs with the app
2. Open a new tab
3. Go to your app URL
4. Press **Ctrl+Shift+R** (Windows) or **Cmd+Shift+R** (Mac)
5. This forces a hard refresh and should pick up the new service worker

### Method 3: Clear All Browser Data

1. **Chrome:** Settings → Privacy → Clear browsing data → Advanced
   - Select "Cached images and files"
   - Select "Cookies and other site data"
   - Time range: "All time"
   - Click "Clear data"

2. **Firefox:** Settings → Privacy & Security → Cookies and Site Data → Clear Data
   - Check "Cached Web Content"
   - Click "Clear"

## After Clearing

1. The new service worker will register automatically
2. The 404 errors should stop
3. Future updates will happen automatically

## For Other Users

If vendors or other users see 404 errors:
- They need to clear their browser cache
- Or wait for the service worker to auto-update (can take a few hours)
- Or do a hard refresh (Ctrl+Shift+R)

## Prevention

The code has been updated to:
- ✅ Auto-update service workers immediately
- ✅ Clean up old caches automatically
- ✅ Handle missing resources gracefully

After you clear your cache and the new code deploys, this should be resolved permanently.


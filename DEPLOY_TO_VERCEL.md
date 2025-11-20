# Deploying to Vercel

## Option 1: Link Project via CLI (Recommended)

1. **Login to Vercel:**
   ```bash
   vercel login
   ```

2. **Link your project:**
   ```bash
   vercel link
   ```
   - It will ask if you want to link to an existing project or create a new one
   - Choose **existing project** and select `hsh-gc-platform`
   - It will ask for project settings - just press Enter to use defaults

3. **Deploy:**
   ```bash
   vercel --prod
   ```

## Option 2: Manual Deployment from Dashboard

1. Go to https://vercel.com/dashboard
2. Find your `hsh-gc-platform` project
3. Click on it
4. Go to the **Deployments** tab
5. Click **Redeploy** on the latest deployment, OR
6. Click **Create Deployment** and select the `master` branch

## Option 3: Check GitHub Integration

If auto-deployments aren't working:

1. Go to https://vercel.com/dashboard
2. Select your project
3. Go to **Settings** → **Git**
4. Make sure:
   - ✅ GitHub is connected
   - ✅ The repository is `mliber13/hsh-gc-platform`
   - ✅ Production branch is set to `master`
   - ✅ Auto-deploy is enabled

## Quick Deploy Command

Once linked, you can deploy anytime with:
```bash
vercel --prod
```


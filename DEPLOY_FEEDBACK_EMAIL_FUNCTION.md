# Deploy Feedback Email Function - Quick Guide

## Since You Already Have Email Setup

If you've already deployed `send-quote-email`, you can skip steps 1-2 and go straight to deploying!

## Step-by-Step

### Step 0: Install Supabase CLI (if not already installed)

**⚠️ Note:** Global npm install is no longer supported. Use one of these methods:

**Option A: Using Scoop (Windows - Recommended)**
```powershell
# First install Scoop if you don't have it:
# Run in PowerShell: Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
# Then: irm get.scoop.sh | iex

# Add Supabase bucket and install
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**Option B: Using Chocolatey (Windows)**
```powershell
# First install Chocolatey if you don't have it:
# Run PowerShell as Admin, then: Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Then install Supabase CLI
choco install supabase
```

**Option C: Using npx (No installation needed - run directly)**
```bash
# You can use npx to run Supabase CLI without installing
npx supabase@latest --version

# For all commands, prefix with npx:
npx supabase@latest link --project-ref YOUR_PROJECT_REF
npx supabase@latest functions deploy send-feedback-email
```

**Option D: Direct Download (Windows)**
1. Go to: https://github.com/supabase/cli/releases
2. Download the latest `supabase_windows_amd64.zip`
3. Extract and add to your PATH, or run directly

After installing (Options A, B, or D), verify it works:
```bash
supabase --version
```

### Step 1: Check if you're already linked (optional)

```bash
# Check if you're already linked to your Supabase project
supabase projects list
```

If you see your project listed, you're good! If not, you'll need to link:

```bash
# Get your project reference from Supabase Dashboard
# Go to: Settings → General → Reference ID
supabase link --project-ref YOUR_PROJECT_REF
```

### Step 2: Verify secrets are set (optional)

Since you already have `send-quote-email` working, your secrets should already be set. But you can verify:

```bash
# List all secrets
supabase secrets list
```

You should see:
- `RESEND_API_KEY`
- `FROM_EMAIL`

If they're missing, set them:

```bash
supabase secrets set RESEND_API_KEY=re_YOUR_API_KEY_HERE
supabase secrets set FROM_EMAIL=onboarding@resend.dev
```

### Step 3: Deploy the Feedback Email Function

```bash
# Deploy the new function
supabase functions deploy send-feedback-email
```

You should see output like:
```
Deploying function send-feedback-email...
Function send-feedback-email deployed successfully
```

### Step 4: Test It

1. Go to your app
2. Submit a new feedback/feature request
3. Check your email (as an admin) - you should receive a notification
4. Update the status or add notes to that feedback
5. Check all team members' emails - they should receive an update notification

### Step 5: Check Logs (if needed)

If emails aren't sending:

```bash
# View function logs
supabase functions logs send-feedback-email
```

Or check in Supabase Dashboard:
- Go to: Edge Functions → send-feedback-email → Logs

## Troubleshooting

### "Function not found" error
- Make sure you're in the project root directory
- Verify the file exists: `supabase/functions/send-feedback-email/index.ts`

### "Not linked to a project" error
- Run: `supabase link --project-ref YOUR_PROJECT_REF`
- Get your project ref from Supabase Dashboard → Settings → General

### Emails not sending
- Check function logs: `supabase functions logs send-feedback-email`
- Verify secrets: `supabase secrets list`
- Make sure your Resend API key is still valid

### CORS errors
- The function includes CORS headers automatically
- If issues persist, check browser console for specific errors

## Quick Command Reference

**If using npx (no installation):**
```bash
# Link project (if needed)
npx supabase@latest link --project-ref YOUR_PROJECT_REF

# Set secrets (if needed)
npx supabase@latest secrets set RESEND_API_KEY=re_YOUR_KEY
npx supabase@latest secrets set FROM_EMAIL=onboarding@resend.dev

# Deploy function
npx supabase@latest functions deploy send-feedback-email

# View logs
npx supabase@latest functions logs send-feedback-email

# List secrets
npx supabase@latest secrets list
```

**If using installed CLI (Scoop/Chocolatey):**
```bash
# Link project (if needed)
supabase link --project-ref YOUR_PROJECT_REF

# Set secrets (if needed)
supabase secrets set RESEND_API_KEY=re_YOUR_KEY
supabase secrets set FROM_EMAIL=onboarding@resend.dev

# Deploy function
supabase functions deploy send-feedback-email

# View logs
supabase functions logs send-feedback-email

# List secrets
supabase secrets list
```


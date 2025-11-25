# Install Supabase CLI on Windows

## Option 1: Using Scoop (Recommended for Windows)

1. **Install Scoop** (if you don't have it):
   ```powershell
   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
   irm get.scoop.sh | iex
   ```

2. **Install Supabase CLI**:
   ```powershell
   scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
   scoop install supabase
   ```

## Option 2: Using Chocolatey

1. **Install Chocolatey** (if you don't have it):
   - Visit: https://chocolatey.org/install
   - Follow the installation instructions

2. **Install Supabase CLI**:
   ```powershell
   choco install supabase
   ```

## Option 3: Manual Download

1. Go to: https://github.com/supabase/cli/releases
2. Download the Windows executable
3. Add it to your PATH

## Option 4: Use npx (No Installation Needed)

You can use `npx` to run Supabase CLI without installing it globally:

```powershell
npx supabase link --project-ref rvtdavpsvrhbktbxquzm
npx supabase secrets set RESEND_API_KEY=re_YsotDvtA_K3Tmd1qiDy5K5RmjVbYzhjvq
npx supabase secrets set FROM_EMAIL=onboarding@resend.dev
npx supabase functions deploy send-quote-email
```

## Verify Installation

After installing, verify it works:
```powershell
supabase --version
```

## Next Steps

Once installed, run the deployment commands from `DEPLOY_EMAIL_FUNCTION.md`.










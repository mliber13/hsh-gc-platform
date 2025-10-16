# PowerShell Script to Deploy Supabase Edge Function
# Run this after setting up Supabase CLI and secrets

Write-Host "🚀 Deploying invite-user Edge Function..." -ForegroundColor Cyan

# Check if Supabase CLI is installed
try {
    $version = supabase --version
    Write-Host "✅ Supabase CLI found: $version" -ForegroundColor Green
} catch {
    Write-Host "❌ Supabase CLI not found. Install it first:" -ForegroundColor Red
    Write-Host "   npm install -g supabase" -ForegroundColor Yellow
    exit 1
}

# Deploy the function
Write-Host "`n📤 Deploying function..." -ForegroundColor Cyan
supabase functions deploy invite-user

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Edge Function deployed successfully!" -ForegroundColor Green
    Write-Host "`n📧 Your invitation emails will now be sent automatically." -ForegroundColor Cyan
    Write-Host "`nEndpoint: https://rvtdavpsvrhbktbxquzm.supabase.co/functions/v1/invite-user" -ForegroundColor Gray
} else {
    Write-Host "`n❌ Deployment failed. Check the error above." -ForegroundColor Red
    Write-Host "`nCommon fixes:" -ForegroundColor Yellow
    Write-Host "1. Link your project: supabase link --project-ref rvtdavpsvrhbktbxquzm" -ForegroundColor Gray
    Write-Host "2. Set secrets: supabase secrets set SUPABASE_SERVICE_ROLE_KEY=..." -ForegroundColor Gray
    exit 1
}


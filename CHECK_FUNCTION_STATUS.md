# Check Edge Function Status

## Steps to Diagnose the 503 Error

### 1. Redeploy the Function

Run this command in your terminal:
```powershell
npx supabase functions deploy send-quote-email
```

### 2. Check Function Logs

After redeploying, check the logs:

**Option A: Via Supabase Dashboard**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Edge Functions** in the left sidebar
4. Click on `send-quote-email`
5. Click the **Logs** tab
6. Try creating a quote request in your app
7. Watch the logs for any errors

**Option B: Via CLI**
```powershell
npx supabase functions logs send-quote-email
```

### 3. Verify Secrets Are Set

```powershell
npx supabase secrets list
```

You should see:
- `RESEND_API_KEY`
- `FROM_EMAIL`

If not, set them:
```powershell
npx supabase secrets set RESEND_API_KEY=re_YsotDvtA_K3Tmd1qiDy5K5RmjVbYzhjvq
npx supabase secrets set FROM_EMAIL=onboarding@resend.dev
```

### 4. Test the Function Directly

In Supabase Dashboard:
1. Go to **Edge Functions** → `send-quote-email`
2. Click **Invoke** button
3. Use this test payload:
```json
{
  "to": "your-email@example.com",
  "projectName": "Test Project",
  "quoteLink": "https://example.com/quote/123",
  "scopeOfWork": "Test scope",
  "expiresAt": "2024-12-31T00:00:00Z"
}
```

### 5. Common Issues

**503 Service Unavailable:**
- Function might be cold-starting (first request after inactivity)
- Function might be crashing on startup
- Check logs for startup errors

**CORS Errors:**
- Make sure OPTIONS requests are handled first
- Check that CORS headers are in all responses

**Function Not Found:**
- Verify the function is deployed: `npx supabase functions list`
- Make sure you're using the correct function name

### 6. What I Fixed

1. **Better CORS handling** - OPTIONS requests now return immediately with proper headers
2. **Safer JSON parsing** - Won't crash if request body is invalid
3. **Better error messages** - More detailed error reporting

### 7. After Redeploying

1. Wait 30 seconds for the function to be fully deployed
2. Try creating a quote request in your app
3. Check the browser console for errors
4. Check Supabase function logs for any errors
5. Check Resend dashboard to see if emails are being sent










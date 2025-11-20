# Troubleshooting Email Function

## Issue: CORS 503 Error

If you're seeing a CORS 503 error when trying to send emails, try these steps:

### 1. Redeploy the Function

After making code changes, redeploy:
```bash
npx supabase functions deploy send-quote-email
```

### 2. Check Function Logs

In Supabase Dashboard:
1. Go to **Edge Functions**
2. Click on `send-quote-email`
3. Click **Logs** tab
4. Look for any errors

### 3. Verify Secrets Are Set

```bash
npx supabase secrets list
```

You should see:
- `RESEND_API_KEY`
- `FROM_EMAIL`

If not, set them again:
```bash
npx supabase secrets set RESEND_API_KEY=re_YOUR_KEY
npx supabase secrets set FROM_EMAIL=onboarding@resend.dev
```

### 4. Test the Function Directly

You can test the function in Supabase Dashboard:
1. Go to **Edge Functions** → `send-quote-email`
2. Click **Invoke**
3. Use this test payload:
```json
{
  "to": "your-email@example.com",
  "projectName": "Test Project",
  "quoteLink": "https://example.com/quote/123",
  "scopeOfWork": "Test scope of work",
  "expiresAt": "2024-12-31T00:00:00Z"
}
```

### 5. Check Resend API Key

- Verify the API key is correct in Resend dashboard
- Make sure it hasn't been revoked
- Check Resend dashboard for any delivery issues

### 6. Common Issues

**503 Service Unavailable:**
- Function might be cold-starting (first request after inactivity)
- Check function logs for errors
- Verify secrets are set correctly

**CORS Errors:**
- Make sure CORS headers are included in all responses
- Check that OPTIONS requests are handled

**Email Not Sending:**
- Check Resend dashboard → Emails section
- Verify FROM_EMAIL is valid (onboarding@resend.dev for testing)
- Check spam folder

### 7. Fallback Behavior

If emails fail, the app will:
- Show you the quote links to copy manually
- Provide mailto links as a fallback
- Log errors to console








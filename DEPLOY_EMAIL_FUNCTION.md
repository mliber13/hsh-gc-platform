# Deploy Email Function - Quick Start Guide

## Prerequisites

1. **Supabase CLI installed**
   ```bash
   npm install -g supabase
   ```

2. **Your Resend API Key**
   - You already have it: `re_YsotDvtA_K3Tmd1qiDy5K5RmjVbYzhjvq`
   - Keep this secure!

## Step-by-Step Deployment

### 1. Link Your Supabase Project

```bash
# Get your project reference from Supabase Dashboard
# Go to: Settings → General → Reference ID

supabase link --project-ref YOUR_PROJECT_REF
```

### 2. Set Environment Variables (Secrets)

```bash
# Set your Resend API key
supabase secrets set RESEND_API_KEY=re_YsotDvtA_K3Tmd1qiDy5K5RmjVbYzhjvq

# Set the from email (use onboarding@resend.dev for testing, or your verified domain)
supabase secrets set FROM_EMAIL=onboarding@resend.dev
```

**Note:** For production, you'll want to:
- Verify your own domain in Resend
- Use an email like `noreply@yourdomain.com`

### 3. Deploy the Function

```bash
supabase functions deploy send-quote-email
```

### 4. Test It

1. Go to your app
2. Create a quote request
3. Check that emails are sent successfully
4. Check Supabase Dashboard → Edge Functions → Logs for any errors

## Troubleshooting

### Function Not Found Error
- Make sure you're in the project root directory
- Verify the function file exists at: `supabase/functions/send-quote-email/index.ts`

### Email Not Sending
- Check Supabase Dashboard → Edge Functions → Logs
- Verify secrets are set: `supabase secrets list`
- Test your Resend API key works: Try the example code in Resend dashboard

### CORS Errors
- The function includes CORS headers
- If issues persist, check the `cors.ts` file

## Next Steps

Once emails are working:
1. Verify your domain in Resend (for production)
2. Update `FROM_EMAIL` to use your verified domain
3. Customize the email template if needed

## Security Notes

- Never commit your API key to git
- Use Supabase secrets for all sensitive values
- Rotate your API key if it's ever exposed


# Email Integration Setup Guide

## Overview

The quote request system now supports automatic email sending to vendors. When you create a quote request, emails are automatically sent to vendors with a link to submit their quote.

## Setup Options

### Option 1: Supabase Edge Function with Resend (Recommended)

1. **Get a Resend API Key**
   - Sign up at [resend.com](https://resend.com)
   - Create an API key in your dashboard
   - Verify your domain (or use their test domain)

2. **Deploy the Edge Function**
   ```bash
   # Install Supabase CLI if not already installed
   npm install -g supabase
   
   # Link your project
   supabase link --project-ref YOUR_PROJECT_REF
   
   # Set environment variables
   supabase secrets set RESEND_API_KEY=your_resend_api_key
   supabase secrets set FROM_EMAIL=noreply@yourdomain.com
   
   # Deploy the function
   supabase functions deploy send-quote-email
   ```

3. **Test the Function**
   - Create a quote request in the app
   - Check that emails are sent successfully

### Option 2: Use Mailto Links (Fallback)

If the Edge Function is not set up, the system will:
- Attempt to send via Edge Function (will fail gracefully)
- Show you the quote links to copy
- Provide mailto links you can use to send emails manually

### Option 3: Alternative Email Services

You can modify `supabase/functions/send-quote-email/index.ts` to use:
- **SendGrid**: Replace Resend API calls with SendGrid
- **AWS SES**: Use AWS SDK for email sending
- **Mailgun**: Use Mailgun API
- **SMTP**: Use a direct SMTP connection

## Email Template

The email includes:
- Professional HTML template with HSH branding
- Project name and trade information
- Scope of work
- Direct link to submit quote
- Due date and expiration information

## Troubleshooting

### Emails Not Sending

1. **Check Edge Function Status**
   - Go to Supabase Dashboard → Edge Functions
   - Check if `send-quote-email` is deployed
   - View function logs for errors

2. **Verify API Key**
   - Ensure `RESEND_API_KEY` is set correctly
   - Check that the API key has send permissions

3. **Check Email Service Limits**
   - Resend free tier: 3,000 emails/month
   - Verify your domain is verified (if using custom domain)

### Fallback Behavior

If emails fail to send:
- The system will show you the quote links
- You can copy and send them manually
- Or use the mailto links provided

## Environment Variables

Required for Supabase Edge Function:
- `RESEND_API_KEY`: Your Resend API key
- `FROM_EMAIL`: Email address to send from (must be verified in Resend)

## Next Steps

Once emails are working:
1. Test with a real vendor email
2. Verify emails are received
3. Check that quote links work correctly
4. Monitor email delivery rates


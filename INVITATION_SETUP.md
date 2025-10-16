# User Invitation Email Setup Guide

This guide walks you through setting up automated email invitations using Supabase's built-in auth system.

---

## 🎯 Overview

When you invite a new user:
1. ✅ Invitation record created in database
2. ✅ Supabase sends invitation email with magic link
3. ✅ User clicks link → Creates account → Auto-added to your organization

---

## 📋 Prerequisites

Before starting, you need:
- [x] Supabase account
- [x] Project already created
- [ ] Supabase CLI installed
- [ ] Service role key from Supabase dashboard

---

## 🚀 Step 1: Install Supabase CLI

### Windows (PowerShell):
```powershell
scoop install supabase
```

Or using npm:
```bash
npm install -g supabase
```

### Verify installation:
```bash
supabase --version
```

---

## 🔑 Step 2: Get Your Service Role Key

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project: **HSH GC Platform**
3. Click **Settings** → **API**
4. Find **Service Role Key** (starts with `eyJ...`)
5. **⚠️ IMPORTANT:** Keep this secret! Never commit to Git!

---

## 📤 Step 3: Deploy the Edge Function

### A. Link Your Project
```bash
cd "C:\Users\mlibe\Documents\HSH APP\hsh-gc-platform"
supabase link --project-ref YOUR_PROJECT_REF
```

**Find your project ref:**
- Your Supabase URL: `https://rvtdavpsvrhbktbxquzm.supabase.co`
- Project ref: `rvtdavpsvrhbktbxquzm`

### B. Set Environment Variables

The Edge Function needs these secrets:
```bash
supabase secrets set SUPABASE_URL=https://rvtdavpsvrhbktbxquzm.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
supabase secrets set SUPABASE_ANON_KEY=your_anon_key_here
supabase secrets set PUBLIC_APP_URL=https://hsh-gc-platform.vercel.app
```

### C. Deploy the Function
```bash
supabase functions deploy invite-user
```

You should see:
```
✅ Function invite-user deployed successfully
🌐 Endpoint: https://rvtdavpsvrhbktbxquzm.supabase.co/functions/v1/invite-user
```

---

## 📧 Step 4: Configure Email Templates

### A. Enable Email Auth

1. Go to **Authentication** → **Providers**
2. Ensure **Email** is enabled
3. **Enable email confirmations**: ✅ ON

### B. Customize Invitation Email Template

1. Go to **Authentication** → **Email Templates**
2. Select **Invite user** template
3. Customize the template:

```html
<h2>You've been invited to HSH GC Platform!</h2>

<p>Hi there,</p>

<p>You've been invited to join <strong>{{ .SiteURL }}</strong> as a team member.</p>

<p>Click the button below to accept the invitation and set up your account:</p>

<a href="{{ .ConfirmationURL }}" 
   style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
   Accept Invitation
</a>

<p>Or copy and paste this link into your browser:</p>
<p>{{ .ConfirmationURL }}</p>

<p><small>This invitation will expire in 7 days.</small></p>

<hr>
<p><small>HSH GC Platform - Construction Management Software</small></p>
```

### C. Configure Redirect URL

1. Go to **Authentication** → **URL Configuration**
2. Add to **Redirect URLs**:
   ```
   https://hsh-gc-platform.vercel.app/accept-invitation
   http://localhost:5173/accept-invitation
   ```

---

## 🧪 Step 5: Test the Invitation Flow

### A. Send a Test Invitation

1. Log in to your app as an admin
2. Go to **User Management**
3. Click **Invite User**
4. Enter email: `test@example.com`
5. Select role: **Editor**
6. Click **Send Invitation**

### B. Check the Console

You should see:
```
✅ Invitation email sent successfully: { success: true, ... }
```

### C. Check Email

The invited user should receive an email with:
- Subject: "You've been invited to join HSH GC Platform"
- Button: "Accept Invitation"
- Expiration notice: "This invitation will expire in 7 days"

### D. Accept Invitation

1. Click the link in the email
2. User is redirected to: `https://hsh-gc-platform.vercel.app/accept-invitation`
3. User sets password
4. User is automatically added to organization with assigned role

---

## 🔍 Troubleshooting

### Problem: "Edge Function not found"
**Solution:** Make sure you deployed the function:
```bash
supabase functions deploy invite-user
```

### Problem: "Failed to send invitation email"
**Solution:** Check secrets are set:
```bash
supabase secrets list
```

### Problem: "Email not received"
**Solutions:**
1. Check spam folder
2. Verify email provider settings in Supabase
3. Check Supabase logs: **Logs** → **Edge Functions**
4. Enable email debugging: **Settings** → **Auth** → **Email Debugging**

### Problem: "SMTP not configured"
**Solution:** Supabase provides default SMTP, but for production:
1. Go to **Settings** → **Auth** → **SMTP Settings**
2. Configure custom SMTP (recommended for production):
   - SendGrid
   - Mailgun
   - AWS SES
   - Postmark

---

## 📊 Monitor Invitations

### Check Invitation Status

```sql
-- View all pending invitations
SELECT * FROM user_invitations WHERE status = 'pending';

-- View expired invitations
SELECT * FROM user_invitations WHERE expires_at < NOW();
```

### Edge Function Logs

1. Go to **Edge Functions** → **invite-user**
2. Click **Logs**
3. View real-time function executions

---

## 🔒 Security Notes

1. **Service Role Key**: Never expose this in client-side code
2. **Edge Function**: Validates admin role before sending invites
3. **Rate Limiting**: Supabase has built-in rate limits (120 emails/hour on free tier)
4. **RLS Policies**: Ensure `user_invitations` table has proper RLS policies

---

## 🎉 Production Checklist

Before going live:

- [ ] Custom SMTP configured (not Supabase default)
- [ ] Email templates customized with branding
- [ ] Redirect URLs updated for production domain
- [ ] Edge Function deployed and tested
- [ ] Rate limits reviewed (upgrade plan if needed)
- [ ] Monitoring/alerting set up for failed invites
- [ ] Email deliverability tested (check spam scores)

---

## 📚 Additional Resources

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Email Templates Guide](https://supabase.com/docs/guides/auth/auth-email-templates)
- [SMTP Configuration](https://supabase.com/docs/guides/auth/auth-smtp)

---

## 💡 Next Steps

Once invitations are working:
1. ✅ Users receive emails automatically
2. ✅ They can accept and create accounts
3. ✅ They're added to your organization
4. ✅ Role-based permissions apply immediately

**Ready to move on to Budget Intelligence?** 🚀


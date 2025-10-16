# Supabase Edge Function Setup Guide

## 📧 User Invitation Email Setup

This guide explains how to deploy the Edge Function for sending invitation emails.

---

## 🚀 **Deployment Steps**

### **1. Install Supabase CLI**

First, install the Supabase CLI if you haven't already:

```bash
# Windows (with Scoop)
scoop install supabase

# Or with NPM
npm install -g supabase
```

### **2. Login to Supabase**

```bash
supabase login
```

This will open your browser to authenticate with Supabase.

### **3. Link Your Project**

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

**To find your project ref:**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to Settings → General
4. Copy the "Reference ID"

### **4. Deploy the Edge Function**

From your project root directory:

```bash
supabase functions deploy invite-user
```

This will deploy the `invite-user` function to your Supabase project.

### **5. Set Environment Variables**

The Edge Function needs access to these environment variables (automatically available):
- `SUPABASE_URL` - Your project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (secret!)
- `PUBLIC_SITE_URL` - Your app URL for redirect (set this manually)

**Set PUBLIC_SITE_URL:**

```bash
# For production
supabase secrets set PUBLIC_SITE_URL=https://hsh-gc-platform.vercel.app

# For local development
supabase secrets set PUBLIC_SITE_URL=http://localhost:5173
```

---

## ✉️ **Configure Email Templates (Optional)**

Supabase uses default email templates, but you can customize them:

### **1. Go to Authentication Settings**
1. Open Supabase Dashboard
2. Go to **Authentication** → **Email Templates**

### **2. Customize the "Invite User" Template**

**Default template works fine, but you can customize:**

```html
<h2>You're invited to join HSH Contractors!</h2>

<p>Hi there,</p>

<p>You've been invited to join the HSH Contractors platform. Click the link below to create your account and get started:</p>

<p><a href="{{ .ConfirmationURL }}">Accept Invitation</a></p>

<p>This invitation will expire in 7 days.</p>

<p>If you didn't expect this invitation, you can safely ignore this email.</p>

<p>Thanks,<br>HSH Contractors Team</p>
```

### **3. Configure Email Settings**

Go to **Authentication** → **Settings** → **Email**:

- ✅ **Enable Email Confirmations** (should be on)
- ✅ **Enable Email Change Confirmations** (recommended)
- ⚠️ **Double check SMTP settings** (default Supabase SMTP works for testing)

---

## 🧪 **Testing the Invitation Flow**

### **1. Send an Invitation**

In your app:
1. Go to User Management (click your email → "Manage Users")
2. Click "Invite User"
3. Enter email and select role
4. Click "Send Invitation"

### **2. Check Console**

You should see:
```
📧 Sending invitation to user@example.com with role editor
✅ Invitation sent successfully
```

### **3. Check Email**

The invited user should receive an email with:
- Subject: "You've been invited"
- A magic link to accept the invitation
- Link valid for 7 days

### **4. Accept Invitation**

When user clicks the link:
1. Redirected to your app (with auth token)
2. Profile automatically created with assigned role
3. User can access the app immediately

---

## 🔧 **Troubleshooting**

### **"Failed to send invitation" Error**

**Check:**
1. Edge Function is deployed: `supabase functions list`
2. Environment variables are set: `supabase secrets list`
3. Service role key is correct (check dashboard)

### **Email Not Received**

**Check:**
1. Spam/junk folder
2. Email address is correct
3. Supabase email quota not exceeded (free tier: 3 emails/hour during dev)
4. Email confirmations are enabled in Auth settings

### **"Only admins can invite users" Error**

**Solution:**
Update your profile role in Supabase:
```sql
UPDATE profiles 
SET role = 'admin' 
WHERE email = 'your-email@example.com';
```

### **CORS Errors**

The Edge Function includes CORS headers. If you still see errors:
1. Check that `PUBLIC_SITE_URL` matches your app URL
2. Verify Supabase URL in your .env file

---

## 🌐 **Local Development**

To test Edge Functions locally:

```bash
# Start Supabase locally
supabase start

# Serve functions locally
supabase functions serve invite-user

# The function will be available at:
# http://localhost:54321/functions/v1/invite-user
```

**Update your .env for local testing:**
```
VITE_SUPABASE_URL=http://localhost:54321
```

---

## 📊 **Email Quotas**

**Free Tier:**
- 3 emails/hour during development
- Upgrade to Pro for production use

**Pro Tier:**
- Higher email limits
- Custom SMTP (use your own email service)
- Better deliverability

**Recommendation:** For production, consider upgrading or using a custom SMTP provider (SendGrid, Mailgun, etc.)

---

## 🔐 **Security Notes**

1. ✅ Service role key is NEVER exposed to client
2. ✅ Edge Function validates admin role before sending invites
3. ✅ Only authenticated users can call the function
4. ✅ Invitations expire after 7 days
5. ✅ User metadata (role, organization) stored in profile

---

## ✨ **What Happens When Someone Accepts an Invitation**

1. User clicks magic link in email
2. Redirected to your app with auth token
3. Supabase creates auth user automatically
4. You need to create a **profile** for the user

### **Add Signup Handler (if not already present)**

In your auth callback, create the profile:

```typescript
// When new user signs up via invitation
const { organization_id, role } = user.user_metadata

await supabase.from('profiles').insert({
  id: user.id,
  email: user.email,
  organization_id: organization_id,
  role: role,
  invited_by: user.user_metadata.invited_by
})
```

---

## 📝 **Next Steps**

1. ✅ Deploy the Edge Function
2. ✅ Set environment variables
3. ✅ Test invitation flow
4. ✅ Customize email templates (optional)
5. ✅ Add signup handler for new users
6. ✅ Consider upgrading for production use

---

**Questions?** Check the Supabase docs: https://supabase.com/docs/guides/functions

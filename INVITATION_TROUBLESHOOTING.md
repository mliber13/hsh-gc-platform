# Invitation Email Troubleshooting Guide

## 🔍 Issue: User Created But No Email Sent

If you see the user in **Authentication** but they didn't receive an email, here are the likely causes:

---

## ✅ **Step 1: Check Supabase Auth Email Settings**

### Go to Auth Settings:
https://app.supabase.com/project/rvtdavpsvrhbktbxquzm/auth/settings

### Check These Settings:

#### 1. **Enable email confirmations**
- Should be: ✅ **ENABLED**
- Location: Settings → Auth → Email Auth
- If disabled, Supabase creates users but doesn't send emails

#### 2. **Enable email provider**
- Should be: ✅ **Email** provider enabled
- Location: Auth → Providers → Email

#### 3. **SMTP Settings** (Critical!)
- Location: Auth → SMTP Settings
- **Default:** Supabase SMTP (limited rate)
- **Problem:** Default SMTP might be disabled or rate-limited

### Fix SMTP Issues:

**Option A - Enable Supabase SMTP (Free):**
1. Go to: https://app.supabase.com/project/rvtdavpsvrhbktbxquzm/auth/settings
2. Scroll to **SMTP Settings**
3. If "Enable Custom SMTP" is OFF, you're using Supabase default ✅
4. **Check:** Is there a warning about rate limits?

**Option B - Use Custom SMTP (Recommended):**
Set up your own SMTP provider:
- SendGrid (Free: 100 emails/day)
- Mailgun (Free: 100 emails/day)
- AWS SES (Pay-as-you-go, very cheap)

---

## ✅ **Step 2: Verify Email Template is Active**

### Check Email Templates:
https://app.supabase.com/project/rvtdavpsvrhbktbxquzm/auth/templates

### For "Invite user" template:
- ✅ Should have content (not blank)
- ✅ Should have `{{ .ConfirmationURL }}` variable
- ✅ Preview should show proper formatting

---

## ✅ **Step 3: Check if Edge Function Was Actually Called**

### Did the app actually call the Edge Function?

**Look in Browser Console for:**
```
✅ Invitation email sent successfully: {...}
```

**Or an error:**
```
❌ Error sending invitation email: ...
```

### If you see "Invitation email sent successfully":
- Edge Function was called ✅
- Problem is in Supabase Auth email configuration

### If you DON'T see either message:
- Edge Function wasn't called ❌
- Problem is in the frontend code

---

## ✅ **Step 4: Check Edge Function Logs**

### View Logs in Dashboard:
https://supabase.com/dashboard/project/rvtdavpsvrhbktbxquzm/functions/invite-user/logs

**Look for:**
1. Recent executions (should show your test)
2. Any error messages
3. The `inviteUserByEmail` response

**Common Errors:**
- `SMTP not configured` → Need to set up SMTP
- `Email rate limit exceeded` → Too many emails sent
- `Invalid email` → Email format is wrong

---

## ✅ **Step 5: Manual Test via SQL**

### Test Supabase Auth directly:

Go to SQL Editor: https://app.supabase.com/project/rvtdavpsvrhbktbxquzm/sql/new

Run this to see auth users:
```sql
-- Check if user was created in auth.users
SELECT 
  id, 
  email, 
  created_at,
  email_confirmed_at,
  invited_at,
  confirmation_sent_at
FROM auth.users 
WHERE email = 'test@example.com'; -- Replace with your test email
```

**What to look for:**
- `invited_at`: Should have a timestamp ✅
- `confirmation_sent_at`: Should have a timestamp ✅ (means email was queued)
- `email_confirmed_at`: Should be NULL (not confirmed yet)

**If `confirmation_sent_at` is NULL:**
→ Email was NOT queued → SMTP issue

---

## 🔧 **Quick Fixes**

### Fix #1: Enable Email Confirmations
```
Settings → Auth → Email Auth
✅ Enable email confirmations
✅ Confirm email (recommended)
```

### Fix #2: Check Redirect URLs
```
Settings → Auth → URL Configuration
Add: https://hsh-gc-platform.vercel.app/accept-invitation
Add: http://localhost:5173/accept-invitation
```

### Fix #3: Disable Email Rate Limiting (for testing)
```
Settings → Auth → Rate Limits
Temporarily increase or disable for testing
```

### Fix #4: Use Custom SMTP
If Supabase SMTP isn't working, set up SendGrid:

1. **Sign up:** https://sendgrid.com (free tier)
2. **Create API Key**
3. **In Supabase:** Settings → Auth → SMTP Settings
4. **Configure:**
   - Host: `smtp.sendgrid.net`
   - Port: `587`
   - Username: `apikey`
   - Password: `[Your SendGrid API Key]`
   - Sender email: `your-email@yourdomain.com`
   - Sender name: `HSH GC Platform`

---

## 🧪 **Test Email Sending Manually**

### Option 1: Use Supabase Dashboard
1. Go to: https://app.supabase.com/project/rvtdavpsvrhbktbxquzm/auth/users
2. Find the user you invited
3. Click **"..."** menu → **"Resend Invitation"**
4. Check if email arrives

### Option 2: Use SQL Query
```sql
-- Manually trigger invitation email
SELECT extensions.http_post(
  'https://rvtdavpsvrhbktbxquzm.supabase.co/functions/v1/invite-user',
  '{"email":"test@example.com","role":"viewer","organizationId":"your-org-id"}',
  'application/json'
);
```

---

## 📊 **Diagnostic Checklist**

Run through this checklist:

- [ ] Email provider enabled in Auth → Providers
- [ ] Email confirmations enabled in Auth settings
- [ ] SMTP configured (or using Supabase default)
- [ ] Email template exists and has content
- [ ] Redirect URLs configured
- [ ] Edge Function deployed and active
- [ ] Browser console shows success message
- [ ] Edge Function logs show execution
- [ ] SQL query shows `confirmation_sent_at` timestamp
- [ ] No rate limit warnings in Supabase

---

## 💡 **Most Common Issue**

**90% of the time, the issue is:**

### **"Enable email confirmations" is OFF**

**Fix:**
1. Go to: https://app.supabase.com/project/rvtdavpsvrhbktbxquzm/auth/settings
2. Find: **"Enable email confirmations"**
3. Toggle it: ✅ **ON**
4. Save
5. Try inviting again

---

## 🆘 **Still Not Working?**

If emails still aren't sending:

1. **Check spam/junk folder** (seriously, check it!)
2. **Try a different email address** (Gmail, Outlook, etc.)
3. **Check Supabase service status**: https://status.supabase.com
4. **View Edge Function logs** for specific error messages
5. **Contact Supabase support** with Edge Function logs

---

## 📝 **What to Tell Me**

To help debug, share:

1. **Browser console output** (when you click "Invite User")
2. **Edge Function logs** (from Supabase dashboard)
3. **SQL query result** (from Step 5 above)
4. **Settings screenshot** (Auth → Email Auth section)

This will help identify exactly where the email is failing!


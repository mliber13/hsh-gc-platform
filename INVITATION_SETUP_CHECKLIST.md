# 📧 User Invitation Setup - Quick Checklist

## ✅ **What You Need To Do**

The code is ready! Now you just need to deploy the Edge Function to Supabase.

---

## 🚀 **Step-by-Step Setup (10 minutes)**

### **Step 1: Install Supabase CLI**

Choose one method:

**Option A: Using npm (recommended)**
```bash
npm install -g supabase
```

**Option B: Using Scoop (if you have Scoop)**
```bash
scoop install supabase
```

---

### **Step 2: Login to Supabase**

```bash
supabase login
```

This will open your browser to authenticate.

---

### **Step 3: Get Your Project Reference ID**

1. Go to https://supabase.com/dashboard
2. Select your **hsh-gc-platform** project
3. Go to **Settings** → **General**
4. Copy the **"Reference ID"** (looks like: `rvtdavpsvrhbktbxquzm`)

---

### **Step 4: Link Your Project**

```bash
cd "C:\Users\mlibe\Documents\HSH APP\hsh-gc-platform"
supabase link --project-ref YOUR_PROJECT_REF
```

Replace `YOUR_PROJECT_REF` with the ID you copied above.

---

### **Step 5: Deploy the Edge Function**

```bash
supabase functions deploy invite-user
```

You should see:
```
Deploying invite-user...
✓ Deployed function invite-user
```

---

### **Step 6: Set Your App URL**

```bash
supabase secrets set PUBLIC_SITE_URL=https://hsh-gc-platform.vercel.app
```

This tells Supabase where to redirect users after they accept invitations.

---

## 🧪 **Testing**

### **Test the Invitation:**

1. Open your app: https://hsh-gc-platform.vercel.app
2. Click your email → "Manage Users"
3. Click "Invite User"
4. Enter a test email (use your own or a test account)
5. Select a role (Editor or Viewer)
6. Click "Send Invitation"

### **Expected Results:**

✅ Console shows: `📧 Sending invitation to user@example.com`  
✅ Console shows: `✅ Invitation sent successfully`  
✅ Email received within 1-2 minutes  
✅ Email contains "You've been invited" and a magic link  

### **Accept the Invitation:**

1. Check email (also check spam folder!)
2. Click the magic link in the email
3. Should redirect to your app
4. New user account created automatically

---

## ⚠️ **Important Notes**

### **Email Limits (Free Tier):**
- 3 emails per hour during development
- 30 emails per hour on Pro plan
- For production use, consider upgrading

### **If Email Not Received:**
1. Check spam/junk folder
2. Wait a few minutes (can be delayed)
3. Check Supabase Dashboard → Logs for errors
4. Verify Edge Function is deployed: `supabase functions list`

### **Common Issues:**

**"Edge function not found"**
- Solution: Make sure you deployed: `supabase functions deploy invite-user`

**"Failed to send invitation"**
- Solution: Check that PUBLIC_SITE_URL is set correctly
- Run: `supabase secrets list` to verify

---

## 📋 **Quick Commands Reference**

```bash
# Check if function is deployed
supabase functions list

# View function logs (helpful for debugging)
supabase functions logs invite-user

# Check secrets
supabase secrets list

# Redeploy if you make changes
supabase functions deploy invite-user
```

---

## 🎯 **That's It!**

Once you complete these 6 steps, your invitation system will be fully functional!

**After setup, try inviting a test user to verify everything works.**

---

**Need help?** See full details in `SUPABASE_SETUP.md`


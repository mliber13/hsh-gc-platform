# Deploy Deal Document Share (No Terminal / Dashboard Only)

Use these steps if you **don't have access to the Supabase CLI** and want to deploy the share-by-email function from the Supabase Dashboard.

---

## Step 1: Open Supabase Dashboard

1. Go to **[supabase.com/dashboard](https://supabase.com/dashboard)** and sign in.
2. Click your **project** (the one used by HSH GC Platform).

---

## Step 2: Go to Edge Functions

1. In the **left sidebar**, click **Edge Functions**.
2. You’ll see the list of functions (e.g. `send-feedback-email`, etc.).

---

## Step 3: Create a New Function

1. Click **“Deploy a new function”** (or “New function”).
2. Choose **“Via Editor”** (create and edit in the dashboard).
3. When asked for a **name**, enter exactly:
   ```text
   send-deal-document-share
   ```
   (Use a hyphen, not underscore.)

---

## Step 4: Paste the Code

1. You’ll see an editor (maybe with a template like “Hello World”).
2. **Select all** the code in the editor (Ctrl+A or Cmd+A) and **delete it**.
3. Open this file in your project:
   ```text
   supabase/functions/send-deal-document-share/index-standalone.ts
   ```
4. **Copy the entire contents** of that file (from the first line to the last).
5. **Paste** into the Dashboard editor (replacing everything that was there).
6. **Remove the first 4 comment lines** at the top (the “PASTE THIS ENTIRE FILE…” block) if you want — they’re optional. Or leave them; the function will still work.

---

## Step 5: Deploy the Function

1. Scroll to the bottom of the page.
2. Click **“Deploy function”** (or “Deploy”).
3. Wait until it says deployment finished (about 10–30 seconds).
4. You should see **send-deal-document-share** in the list of Edge Functions.

---

## Step 6: Set Secrets (Resend for Email)

The function needs **RESEND_API_KEY** and **FROM_EMAIL** so it can send emails.

1. In the **left sidebar**, go to **Project Settings** (gear icon at the bottom).
2. Click **Edge Functions** in the settings menu.
3. Find **“Secrets”** or **“Environment variables”**.
4. Add two secrets:

   | Name             | Value                                      |
   |------------------|--------------------------------------------|
   | `RESEND_API_KEY` | Your Resend API key (starts with `re_`)    |
   | `FROM_EMAIL`     | Your sender email (e.g. `onboarding@resend.dev` or your verified domain) |

   If **RESEND_API_KEY** and **FROM_EMAIL** are already set (e.g. for feedback emails), you don’t need to add them again.

5. Save.

---

## Step 7: Test in the App

1. Open your app and go to **Deal Pipeline**.
2. Open a **deal** that has documents.
3. In **Deal Documents**, click the **Share** icon on a document.
4. Enter **your email** as the recipient and click **Send**.
5. Check your inbox (and spam); you should get an email with a link to the document (valid for 24 hours).

---

## If Something Goes Wrong

- **“Email service not configured”**  
  Add or fix **RESEND_API_KEY** and **FROM_EMAIL** in Project Settings → Edge Functions → Secrets.

- **“Document not found or access denied”**  
  Make sure you’re logged in and the document belongs to a deal you can access.

- **“Could not generate share link”**  
  Check that the **deal-documents** storage bucket exists and that your user can access the file (RLS / policies).

- **Other errors**  
  In the Dashboard go to **Edge Functions** → **send-deal-document-share** → **Logs** and look at the latest log entries for the error message.

---

**Summary:** Deploy the function from the Dashboard, set Resend secrets, then use “Share” on a deal document in the app and check your email.

# Deploy qb-get-job-transactions Without the Terminal

If you can't run `supabase functions deploy` from the terminal, you can update the **qb-get-job-transactions** Edge Function using the Supabase Dashboard.

## Steps

1. **Open Supabase Dashboard**  
   Go to [supabase.com/dashboard](https://supabase.com/dashboard) → your project.

2. **Open Edge Functions**  
   In the left sidebar, click **Edge Functions**.

3. **Open the function**  
   Click **qb-get-job-transactions** (or create it with that name if it doesn’t exist).

4. **Replace the code**  
   - Open the file **`docs/QBO_PASTE_QB_GET_JOB_TRANSACTIONS.ts`** in this repo.
   - Copy its **entire** contents (from the first line to the last `})`).
   - In the Dashboard editor, select all and paste, replacing the existing code.
   - Save / Deploy (the button may say **Save** or **Deploy**).

5. **Secrets**  
   Ensure your project has these Edge Function secrets set (Project Settings → Edge Functions → Secrets):
   - `QB_CLIENT_ID`
   - `QB_CLIENT_SECRET`
   - `QB_USE_PRODUCTION` = `true` for production QuickBooks

## Why this file?

The normal function in `supabase/functions/qb-get-job-transactions/index.ts` imports from `../_shared/qb.ts`. The Dashboard usually only edits one function file and may not resolve that shared import. The paste file **inlines** the shared QuickBooks logic (token refresh + API base URL), so a single copy-paste works in the Dashboard.

## After updating

Use **Import from QuickBooks → View pending transactions** in the app. You should get the updated behavior (broader account/class matching, help text, “Your QuickBooks accounts/classes,” and Debug returning `_debug`).

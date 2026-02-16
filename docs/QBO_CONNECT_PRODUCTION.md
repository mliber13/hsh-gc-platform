# Connect to Your Actual QuickBooks Company (Production)

Use this checklist when you're ready to connect the HSH GC Platform to your **real** QuickBooks Online company instead of the sandbox.

**If you don’t have production keys yet:** Intuit requires you to complete **App details and compliance** in the Developer Portal before they issue production keys. See **[QBO_INTUIT_COMPLIANCE_CHECKLIST.md](./QBO_INTUIT_COMPLIANCE_CHECKLIST.md)** for what to prepare (privacy policy, URLs, questionnaire, etc.).

---

## 1. Intuit Developer Portal

1. Go to **[developer.intuit.com](https://developer.intuit.com)** and sign in.
2. Open your app (or create one) → **Keys & credentials**.
3. Switch to **Production** (not Development):
   - Copy **Production** Client ID.
   - Copy **Production** Client Secret (keep it secret; use only in Supabase).
4. Under **Redirect URIs**, add your **live app URL** exactly, for example:
   - `https://your-app-domain.com/qb-callback`  
   If you're still testing with a local build but using production keys, you can add:
   - `http://localhost:5173/qb-callback`  
   (Only add what you need; the URI must match exactly.)

---

## 2. Frontend environment (where the app is built/hosted)

Set these for your **production** build (e.g. in Vercel/Netlify env or your host’s env):

| Variable | Value |
|----------|--------|
| `VITE_QB_CLIENT_ID` | Your **Production** Client ID from step 1 |
| `VITE_QB_REDIRECT_URI` | Your production redirect URI, e.g. `https://your-app-domain.com/qb-callback` |

Do **not** put the Client Secret in the frontend. The token exchange runs in Supabase.

---

## 3. Supabase Edge Function secrets

In **Supabase Dashboard** → **Project Settings** → **Edge Functions** → **Secrets**, set:

| Secret | Value |
|--------|--------|
| `QB_CLIENT_ID` | Same **Production** Client ID as above |
| `QB_CLIENT_SECRET` | Your **Production** Client Secret from step 1 |
| `QB_USE_PRODUCTION` | `true` |

`QB_USE_PRODUCTION=true` makes all QuickBooks API calls (checks, vendors, company info, etc.) use the **production** API (`quickbooks.api.intuit.com`) instead of the sandbox.

---

## 4. Reconnect in the app

1. In the app, go to **Settings** (or wherever the QuickBooks card is).
2. If you were previously connected to **sandbox**, click **Disconnect QuickBooks**.
3. Click **Connect to QuickBooks**.
4. Sign in with the Intuit account that has access to your **real** QuickBooks company.
5. When Intuit asks which company to connect, choose your **actual** company (not a sandbox company).
6. After redirect, you should see “Successfully Connected!” and the QuickBooks card should show **Connected**.

---

## 5. Verify

- Click **Test** on the QuickBooks card. You should see “QuickBooks connection is working!” and your real company name in the response.
- Enter a project actual (e.g. material or subcontractor) and confirm it syncs to QuickBooks as expected (e.g. as a Check if that’s how your flow is set up).

---

## Summary

| Where | What to use |
|-------|-------------|
| Intuit app | **Production** keys; production redirect URI added |
| Frontend env | `VITE_QB_CLIENT_ID` = Production Client ID, `VITE_QB_REDIRECT_URI` = production callback URL |
| Supabase secrets | `QB_CLIENT_ID`, `QB_CLIENT_SECRET` = Production; `QB_USE_PRODUCTION` = `true` |
| App | Disconnect old connection, then **Connect to QuickBooks** and choose your real company |

After this, the app will use your actual QuickBooks company for all QB features (sync, import, vendors, etc.).

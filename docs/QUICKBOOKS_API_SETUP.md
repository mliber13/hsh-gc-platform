# QuickBooks Online API – Setup & Access

Quick reference for getting into the QuickBooks Online API and how this app uses it.

---

## 1. Get into the QBO API (Intuit Developer)

1. **Go to:** [developer.intuit.com](https://developer.intuit.com)
2. **Sign in** with your Intuit/QuickBooks account.
3. **Apps** → **Create an app** (or open your existing app).
4. **Keys & credentials:**
   - **Client ID** – copy this (used in frontend and optionally in Edge Function env).
   - **Client Secret** – copy this; use only on the server (e.g. Supabase Edge Function secrets), never in the frontend.
5. **Redirect URIs:** Add the URL where QB sends the user after they approve:
   - Development: `http://localhost:5173/qb-callback` (or your dev origin + `/qb-callback`).
   - Production: `https://your-production-domain.com/qb-callback`.
   - The redirect URI in your app **must match exactly** what you set in the Intuit app (including trailing slash or not).
6. **Sandbox vs Production:**
   - **Sandbox:** Test company; use for development. Use **Development** keys and sandbox companies.
   - **Production:** Live QuickBooks company; use when you’re ready to connect real data.
   - The app uses **sandbox** by default. To use your **actual QuickBooks account**, see **Section 8** below.

---

## 2. What This App Already Has

| Piece | Where | Purpose |
|-------|--------|---------|
| **OAuth start** | `quickbooksService.ts` → `initiateQBOAuth()` | Sends user to Intuit to authorize; uses `VITE_QB_CLIENT_ID` and `VITE_QB_REDIRECT_URI`. |
| **Callback** | `QuickBooksCallback.tsx` + route `/qb-callback` | Receives `code` and `realmId` from QB; calls Edge Function to exchange code for tokens. |
| **Token exchange** | Supabase Edge Function `qb-exchange-token` | Exchanges `code` for `access_token` and `refresh_token`; needs `QB_CLIENT_ID` and `QB_CLIENT_SECRET` in Supabase secrets. |
| **Token storage** | `profiles` table | `qb_access_token`, `qb_refresh_token`, `qb_realm_id`, `qb_token_expires_at` (per user). |
| **API calls** | Edge Functions | `qb-get-vendors`, `qb-create-check` read `qb_access_token` and `qb_realm_id` from the profile and call `https://quickbooks.api.intuit.com/v3/company/{realmId}/...` (or sandbox equivalent). |

So: **you already “get into” the API** by connecting in the app (Connect to QuickBooks). That stores tokens in the profile; all QBO API calls go through Edge Functions that use those tokens.

---

## 3. Environment Variables

**Frontend (`.env`):**

- `VITE_QB_CLIENT_ID` – From Intuit app (Keys & credentials).
- `VITE_QB_REDIRECT_URI` – Must match a Redirect URI in the Intuit app (e.g. `http://localhost:5173/qb-callback`).
- `VITE_QB_CLIENT_SECRET` – Optional in frontend; only needed if you ever exchange the code in the client (not recommended). The app uses the Edge Function for exchange, so the **secret should live in Supabase**, not in the frontend.

**Supabase Edge Functions (Supabase Dashboard → Project Settings → Edge Functions → Secrets):**

- `QB_CLIENT_ID` – Same as above (used by `qb-exchange-token`).
- `QB_CLIENT_SECRET` – From Intuit app; **required** for `qb-exchange-token` to exchange the code for tokens.

Set these so that after the user clicks “Connect to QuickBooks” and approves in Intuit, the callback and `qb-exchange-token` can complete and save tokens to the profile.

---

## 4. Making New QBO API Calls (e.g. for Import)

- **Where:** In a **Supabase Edge Function** (so the access token and realm id stay server-side).
- **Pattern:** Same as `qb-get-vendors`: get the user’s `qb_access_token` and `qb_realm_id` from `profiles`, then:
  - **GET:** `https://quickbooks.api.intuit.com/v3/company/{realmId}/query?query=SELECT ... FROM Entity ...&minorversion=65`
  - **Headers:** `Authorization: Bearer {qb_access_token}`, `Accept: application/json`
- **Sandbox:** Use `https://sandbox-quickbooks.api.intuit.com/v3/company/...` if you’re testing with a sandbox company.
- **Token refresh:** If the access token is expired, use the refresh token against Intuit’s token endpoint before calling the API (can be added to a small shared QB helper used by all edge functions).

---

## 5. Useful Intuit Links

- [QuickBooks Online API – Get Started](https://developer.intuit.com/app/developer/qbo/docs/get-started)
- [OAuth 2.0 (Intuit)](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0)
- [API Explorer](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/account) – try queries and see entity shapes.
- [Query language](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/query) – for `SELECT ... FROM Bill`, etc.

Once your app is created and redirect URI is set, **Connect to QuickBooks** in the app and complete the OAuth flow; after that, new Edge Functions can use the same profile tokens to call the QBO API (e.g. for the pending-list import).

---

## 6. Clear project actuals (clean slate)

To remove all labor, material, and subcontractor entries you’ve entered (so you can start fresh and later pull from QuickBooks):

**Option A – Delete only the entries (keeps project actuals rows):**

Run in **Supabase Dashboard → SQL Editor** (as a user with permission to delete these rows, or use the service role):

```sql
DELETE FROM labor_entries;
DELETE FROM material_entries;
DELETE FROM subcontractor_entries;
```

**Option B – Delete project actuals and let entries cascade:**

This removes each project’s actuals row and all its entries (full reset). The app will need to create a new `project_actuals` row when you open Project Actuals again (if your app does that).

```sql
DELETE FROM project_actuals;
```

Use **Option A** if you only want to clear the line items and keep the actuals “container” per project. Use **Option B** for a full reset.

---

## 7. How to test that QB works

1. **Use Development keys** in the Intuit app (sandbox). Your `.env` and Supabase secrets should use the **Development** Client ID and Client Secret.
2. **Run the app** (e.g. `npm run dev`) and open it at `http://localhost:5173` (or whatever matches your `VITE_QB_REDIRECT_URI`).
3. **Go to Settings** (or wherever the QuickBooks card is) and click **“Connect to QuickBooks”**.
4. You should be sent to Intuit. Sign in and choose your **sandbox** company (when using Development keys, Intuit shows sandbox companies). Authorize the app.
5. You should be redirected back to the app at `/qb-callback` and see “Successfully Connected!”. The app saves the tokens to your profile.
6. Back on the QuickBooks card, click **“Test connection”**. The app calls the `qb-test-connection` Edge Function, which uses your stored token to hit the QBO API. If you see “QuickBooks connection is working!” (and company info), the connection and sandbox API are working.
7. **What you can’t test yet:** The “Import from QuickBooks” / pending list isn’t built yet. After we add that, you’ll be able to fetch transactions by account and see the pending list. For now, confirming Connect + Test connection is enough to validate the setup.

---

## 8. Using your actual QuickBooks account (production)

When you're ready to connect your **real** QuickBooks company instead of the sandbox:

1. **Intuit Developer portal**
   - Open your app → **Keys & credentials**.
   - Use the **Production** keys (Production Client ID and Production Client Secret). Development keys only work with sandbox companies.
   - Under **Redirect URIs**, add your **production** app URL, e.g. `https://your-domain.com/qb-callback` (must match exactly).

2. **Environment and secrets**
   - **Frontend (e.g. Vercel/Netlify):** Set `VITE_QB_CLIENT_ID` and `VITE_QB_REDIRECT_URI` to your **production** values (production client ID, production redirect URI).
   - **Supabase Edge Functions (Dashboard → Project Settings → Edge Functions → Secrets):**
     - Set `QB_CLIENT_ID` and `QB_CLIENT_SECRET` to your **Production** Client ID and Client Secret.
     - Set **`QB_USE_PRODUCTION`** = **`true`** so the app calls the production QuickBooks API (`quickbooks.api.intuit.com`) instead of the sandbox.

3. **Re-connect QuickBooks**
   - In the app, go to Settings → QuickBooks and **Disconnect** (if you were connected to sandbox).
   - Click **Connect to QuickBooks** again. Sign in with the Intuit account that has access to your real company and choose that company. After redirect, the app will store production tokens.

4. **Verify**
   - Use **Test connection** on the QuickBooks card. You should see your real company name and connection success.
   - The pending-import list and all QB features will now use your actual QuickBooks data.

**Summary:** Production keys + production redirect URI in Intuit; same keys and `QB_USE_PRODUCTION=true` in Supabase; then connect again in the app to authorize the real company.

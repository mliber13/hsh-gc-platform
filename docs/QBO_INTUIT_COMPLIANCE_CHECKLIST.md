# Intuit App Details & Compliance – What to Prepare

Before Intuit gives you **production keys**, you have to complete **App details and compliance** in the Developer Portal. Here’s what to have ready so you can move through it smoothly.

---

## What Intuit Requires

1. **Compliance / assessment questionnaire** (often 30–40 minutes)
   - **Legal** – How your app and business handle data and user agreements
   - **Technical** – How the app works, how you use the API, error handling
   - **Security** – How you protect data and manage access
   - **Authorization** – How you implement and maintain OAuth/compliance

2. **Production settings** (in the portal)
   - **Hosting** – Country/countries where the app is hosted
   - **IP address(es)** – Where your server/backend runs (e.g. Supabase region)
   - **Host domain** – Your app’s main domain (e.g. `https://your-app.com`)
   - **Launch URL** – Where users open your app (often same as host domain or your login page)
   - **Disconnect URL** – Where users land after disconnecting QuickBooks (e.g. Settings or home: `https://your-app.com` or `https://your-app.com/#settings`)

3. **App / company details**
   - App name, description, logo (if you’re listing publicly)
   - Privacy policy URL (required for production)
   - Terms of use / developer terms URL (if required)
   - Support or contact info

---

## Checklist Before You Start

Use this so you’re not stuck mid-form.

| Item | What to have |
|------|----------------------|
| **Privacy policy** | **Use:** `https://<your-app-domain>/privacy` — The app includes a built-in Privacy Policy page at `/privacy` (no login required). Replace `<your-app-domain>` with your real deployment URL (e.g. `https://hsh-gc.yourcompany.com/privacy`). |
| **Terms of use / EULA** | **Use:** `https://<your-app-domain>/terms` — The app includes a built-in Terms of Use & EULA page at `/terms` (no login required). Example: `https://hsh-gc.yourcompany.com/terms`. |
| **App name & description** | Short, clear description of what the app does (e.g. “Construction project and estimate tracking with QuickBooks sync”). |
| **Host domain** | Exact production URL, e.g. `https://yourapp.vercel.app` or `https://hsh.yourcompany.com`. |
| **Launch URL** | Usually your app’s main URL or login/dashboard URL. |
| **Disconnect URL** | Where to send users after they disconnect QuickBooks (e.g. `https://your-app.com` or your settings route). |
| **Redirect URI** | Must match what you’ll use in production, e.g. `https://your-app.com/qb-callback` (same as in your app’s env). |
| **Hosting country / region** | e.g. United States; if using Supabase, note the region (e.g. US East). |
| **Security summary** | Short notes: “We use OAuth 2.0; tokens stored in Supabase; we don’t store QB client secret in the frontend; API calls go through server-side Edge Functions.” |

---

## Tips

- **Save and return** – You can save the questionnaire and come back; you don’t have to finish in one sitting.
- **One app at a time** – Each app has its own compliance; complete it for the app that will use production keys.
- **Be accurate** – Production settings (especially redirect URI and disconnect URL) must match what your app actually uses.
- **After you submit** – Intuit may approve quickly or ask for more info; reply promptly if they do.

Once compliance is approved, you’ll get **Production** keys in the same app under **Keys & credentials**. Then use [QBO_CONNECT_PRODUCTION.md](./QBO_CONNECT_PRODUCTION.md) to plug those into your app and Supabase.

---

## Legal pages in this app

This codebase includes live pages you can use for Intuit (and general compliance):

| Page | URL (replace with your domain) | Notes |
|------|--------------------------------|--------|
| **Privacy Policy** | `https://<your-domain>/privacy` | Describes data we collect, use, and store (including QuickBooks). No login required. |
| **Terms of Use / EULA** | `https://<your-domain>/terms` | End-User License Agreement and terms. No login required. |

Example: if your app is at `https://hsh-gc.yourcompany.com`, use:
- **Privacy policy URL:** `https://hsh-gc.yourcompany.com/privacy`
- **End-User License Agreement URL:** `https://hsh-gc.yourcompany.com/terms`

Ensure your hosting serves the SPA for these paths (e.g. Vercel/Netlify rewrites so `/privacy` and `/terms` serve `index.html`). Most SPA presets do this by default.

---

## Official Intuit Links

- [Intuit Developer – Go live / publish](https://developer.intuit.com/app/developer/qbo/docs/go-live)
- [Production keys (help)](https://help.developer.intuit.com/s/topic/0TOG00000004rnZOAQ/production-consumer-keys)
- [Security requirements](https://developer.intuit.com/app/developer/qbo/docs/go-live/publish-app/security-requirements) (if the link loads)

If the portal asks for something not listed here, use their in-app help or the Intuit Developer Community for the latest requirements.

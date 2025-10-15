# Supabase Setup Guide

## 🚀 Quick Start

### 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Click "Start your project"
3. Create a new project (choose a region close to you)
4. Wait for the project to be provisioned (~2 minutes)

### 2. Get Your Credentials

1. In your Supabase dashboard, go to **Settings** → **API**
2. Copy these values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **Anon/Public Key** (starts with `eyJ...`)

### 3. Configure the App

1. Open the `.env` file in your project root
2. Replace the placeholder values:
   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT_URL.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

### 4. Run Database Migrations

1. In your Supabase dashboard, go to **SQL Editor**
2. Click "New Query"
3. Copy the contents of `supabase/migrations/001_initial_schema.sql`
4. Paste and click "Run"
5. ✅ You should see "Success. No rows returned"

### 5. Enable Email Authentication

1. Go to **Authentication** → **Providers**
2. Enable **Email** provider
3. Configure email settings (or use default Supabase emails for testing)

### 6. Test the Setup

1. Run `npm run dev`
2. You should see the **login screen**
3. Click "Sign up" to create your first account
4. Check your email for verification link
5. Sign in and you're ready!

## 📊 Database Schema

The migration creates these tables:

- **profiles** - User profile information
- **projects** - Main project records
- **estimates** - Estimate data for projects
- **trades** - Individual estimate line items
- **project_actuals** - Actual cost totals
- **labor_entries** - Labor cost entries
- **material_entries** - Material cost entries
- **subcontractor_entries** - Subcontractor cost entries
- **schedules** - Project schedule data
- **change_orders** - Change order records
- **plans** - Plan library templates
- **item_templates** - Default item templates
- **estimate_templates** - Estimate templates for plans

All tables include:
- ✅ Row Level Security (RLS) - users only see their own data
- ✅ Automatic timestamps (created_at, updated_at)
- ✅ Proper foreign key relationships
- ✅ Optimized indexes

## 🔄 Migrating Existing Data

If you have existing data in localStorage:

1. **Export your data** using the "Export Data" button
2. **Set up Supabase** following steps 1-5 above
3. **Sign up/Sign in** to create your user account
4. Use the migration utility (coming soon) or contact support

## 🔐 Security

- **Row Level Security (RLS)** ensures users can only access their own data
- **Anon key** is safe to expose in frontend (it's read-only without auth)
- **Email verification** required for new accounts
- **Password reset** functionality included

## 🆘 Troubleshooting

### "Cannot read property 'auth' of undefined"
- Check that your `.env` file has the correct Supabase URL and key
- Restart the dev server after updating `.env`

### "New row violates row-level security policy"
- Make sure you're signed in
- Check that the RLS policies were created (run migration again)

### Email not sending
- Check Authentication → Settings → SMTP in Supabase
- For development, check the Supabase logs for the magic link

## 🎯 Next Steps

- The app will run in **offline mode** (localStorage) if Supabase is not configured
- Once configured, it runs in **online mode** (Supabase) with user authentication
- You can switch between modes by setting/unsetting environment variables

## 📝 Notes

- Supabase free tier includes: 500MB database, 2GB file storage, 50,000 monthly active users
- Production deployment: Use Vercel environment variables for Supabase credentials
- Backup: Supabase provides automatic daily backups on paid tiers


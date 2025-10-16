-- Fix Supabase Auth redirect URLs via SQL
-- This updates the auth configuration directly in the database

-- Check current auth config
SELECT * FROM auth.config;

-- Update the site URL to production
UPDATE auth.config 
SET site_url = 'https://hsh-gc-platform.vercel.app'
WHERE parameter = 'site_url';

-- Check if additional_redirect_urls exists and update it
UPDATE auth.config 
SET additional_redirect_urls = '["https://hsh-gc-platform.vercel.app/**", "http://localhost:5173/**"]'
WHERE parameter = 'additional_redirect_urls';

-- If the above doesn't work, try inserting instead
INSERT INTO auth.config (parameter, value) 
VALUES ('additional_redirect_urls', '["https://hsh-gc-platform.vercel.app/**", "http://localhost:5173/**"]')
ON CONFLICT (parameter) 
DO UPDATE SET value = EXCLUDED.value;

-- Verify the changes
SELECT parameter, value FROM auth.config 
WHERE parameter IN ('site_url', 'additional_redirect_urls');


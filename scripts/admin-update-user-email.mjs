/**
 * One-off: change Auth user email via Admin API + optional profiles.email sync.
 *
 * Do NOT commit secrets. Use scripts/.env.admin.local (gitignored).
 *
 *   npm run admin:update-user-email
 *
 * Requires Node 20+ for --env-file, or set the same variables in your shell.
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const userId = process.env.ADMIN_EMAIL_UPDATE_USER_ID
const newEmail = process.env.ADMIN_EMAIL_NEW_EMAIL
const syncProfiles =
  (process.env.ADMIN_EMAIL_SYNC_PROFILES ?? 'true').toLowerCase() !== 'false'

function die(msg) {
  console.error(msg)
  process.exit(1)
}

if (!url) die('Missing SUPABASE_URL')
if (!serviceKey) die('Missing SUPABASE_SERVICE_ROLE_KEY')
if (!userId) die('Missing ADMIN_EMAIL_UPDATE_USER_ID')
if (!newEmail) die('Missing ADMIN_EMAIL_NEW_EMAIL')

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: authData, error: authError } = await supabase.auth.admin.updateUserById(
  userId,
  { email: newEmail },
)

if (authError) {
  console.error('Auth update failed:', authError.message)
  process.exit(1)
}

console.log('Auth user updated:', {
  id: authData.user?.id,
  email: authData.user?.email,
})

if (syncProfiles) {
  const { data: prof, error: profError } = await supabase
    .from('profiles')
    .update({ email: newEmail, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id, email')
    .maybeSingle()

  if (profError) {
    console.error('profiles sync failed:', profError.message)
    process.exit(1)
  }
  if (!prof) {
    console.warn(
      'No profiles row matched id; Auth email still changed. Create/fix profile manually if needed.',
    )
  } else {
    console.log('profiles.email synced:', prof)
  }
}

console.log('Done. Send password recovery to the new email if needed.')

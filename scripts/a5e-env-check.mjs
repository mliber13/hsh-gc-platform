// Small helper: verify that the env vars needed by a5e-storage-migration.mjs
// are loadable from .env. No mutations, no API calls. Cross-platform.
//
// Usage: node scripts/a5e-env-check.mjs
//
// Output: prints URL_OK / KEY_OK / lengths / prefixes. Exit 0 if both keys
// present and KEY appears to be a JWT, exit 1 otherwise.

import fs from 'node:fs';
import path from 'node:path';

(function loadDotenv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.log('NOTE: .env not found at', envPath);
    return;
  }
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined) continue;
    const value = rawValue.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    process.env[key] = value;
  }
})();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

console.log('URL_OK:    ', url ? 'yes' : 'NO');
console.log('URL_VALUE: ', url || '<unset>');
console.log('KEY_OK:    ', key ? 'yes' : 'NO');
console.log('KEY_LEN:   ', key ? key.length : 0);
console.log('KEY_PREFIX:', key ? key.slice(0, 12) + '...' : '<none>');

// Sanity: distinguish anon vs service_role by decoding the JWT payload
if (key) {
  try {
    const parts = key.split('.');
    if (parts.length !== 3) {
      console.log('KEY_FORMAT: NOT a JWT (expected 3 dot-separated parts, got ' + parts.length + ')');
    } else {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      console.log('KEY_ROLE:  ', payload.role || '<missing role claim>');
      if (payload.role !== 'service_role') {
        console.log('WARNING:   the SUPABASE_SERVICE_ROLE_KEY is NOT role=service_role.');
        console.log('           If role=anon, you copied the wrong key from the Dashboard.');
      }
    }
  } catch (e) {
    console.log('KEY_FORMAT: failed to decode JWT:', e.message);
  }
}

if (anonKey && key && anonKey === key) {
  console.log('WARNING: VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are byte-identical.');
  console.log('         These should be DIFFERENT keys. Re-check the Dashboard.');
}

if (!url || !key) {
  console.log('\nFAIL: missing one or more required env vars.');
  process.exit(1);
}

const decoded = (() => {
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString('utf8'));
  } catch {
    return null;
  }
})();

if (!decoded || decoded.role !== 'service_role') {
  console.log('\nFAIL: SUPABASE_SERVICE_ROLE_KEY does not have role=service_role.');
  process.exit(1);
}

console.log('\nOK: env is ready for the migration script.');
process.exit(0);

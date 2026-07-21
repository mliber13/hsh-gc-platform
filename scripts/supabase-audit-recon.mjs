/**
 * READ-ONLY Supabase audit recon:
 *  - Enumerate all tables exposed via PostgREST (public schema).
 *  - Service-role exact row count per table.
 *  - ANON-key read sweep: does an unauthenticated request return rows? (RLS gap / public policy)
 * No writes. Safe.
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
readFileSync(resolve(root, '.env'), 'utf8')
  .split(/\r?\n/)
  .forEach((l) => {
    const m = l.match(/^([^#=]+)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })

const URL = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY

async function rest(path, key, extraHeaders = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...extraHeaders },
  })
  return res
}

// 1. Enumerate tables from the OpenAPI root (service role).
const rootRes = await rest('', SERVICE, { Accept: 'application/openapi+json' })
const spec = await rootRes.json()
const tables = Object.keys(spec.definitions || spec.components?.schemas || {}).sort()
console.log(`Tables exposed via PostgREST: ${tables.length}\n`)

async function exactCount(table, key) {
  const res = await rest(`${table}?select=*`, key, {
    Prefer: 'count=exact',
    Range: '0-0',
    'Range-Unit': 'items',
  })
  const cr = res.headers.get('content-range') || ''
  const total = cr.includes('/') ? cr.split('/')[1] : '?'
  return { status: res.status, total }
}

const rows = []
for (const t of tables) {
  const svc = await exactCount(t, SERVICE)
  // anon read attempt
  const anonRes = await rest(`${t}?select=*&limit=1`, ANON)
  let anonRows = 0
  let anonStatus = anonRes.status
  if (anonRes.ok) {
    try {
      const body = await anonRes.json()
      anonRows = Array.isArray(body) ? body.length : 0
    } catch {
      anonRows = 0
    }
  }
  rows.push({
    table: t,
    total: svc.total,
    anonStatus,
    anonReadable: anonRes.ok && anonRows > 0,
  })
}

// Report
console.log('TABLE'.padEnd(42), 'ROWS'.padStart(8), '  ANON')
console.log('-'.repeat(70))
for (const r of rows) {
  const flag = r.anonReadable ? '  ⚠️ READABLE BY ANON' : r.anonStatus === 200 ? '  (200 empty/blocked)' : `  ${r.anonStatus}`
  console.log(r.table.padEnd(42), String(r.total).padStart(8), flag)
}

console.log('\n=== ANON-READABLE TABLES (review each — RLS off or public policy) ===')
const exposed = rows.filter((r) => r.anonReadable)
if (exposed.length === 0) console.log('  none')
for (const r of exposed) console.log(`  ${r.table} (${r.total} rows)`)

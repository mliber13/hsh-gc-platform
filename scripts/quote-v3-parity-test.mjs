/**
 * Q.C.4 — v2 vs v3 quote math parity harness (read-only).
 *
 * Usage:
 *   node scripts/quote-v3-parity-test.mjs
 *   node scripts/quote-v3-parity-test.mjs --fixtures scripts/fixtures/quote-v3-parity-fixtures.json
 *
 * Requires VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env (or env vars) unless --fixtures is passed.
 * Math runs via Node `--experimental-strip-types` against scripts/lib/quoteV3ParityRun.ts.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnv() {
  try {
    const raw = readFileSync(resolve(root, '.env'), 'utf8')
    const env = {}
    raw.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
    })
    return env
  } catch {
    return {}
  }
}

const env = { ...loadEnv(), ...process.env }
const fixturesArg = process.argv.find((a) => a.startsWith('--fixtures'))
const fixturesPath = fixturesArg?.includes('=')
  ? fixturesArg.split('=')[1]
  : fixturesArg
    ? process.argv[process.argv.indexOf('--fixtures') + 1]
    : null

const TEST_NAME_PATTERNS = [
  'Hartville - Irwin',
  'Stangl',
  'McCamon',
  'Kent - Murphy',
]

/** Section 13 reference — not present in prod DB at 2026-06; optional if added later. */
const OPTIONAL_PATTERNS = ['Goodwill Multi']

function resolveV2QuotePayload(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (raw.version === 3 && raw.legacyV2Snapshot) {
    return raw.legacyV2Snapshot
  }
  if (raw.version === 2 || raw.sqft != null || raw.materialRate != null) {
    return raw
  }
  return null
}

async function fetchFromSupabase() {
  const url = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  }

  const supabase = createClient(url, key)
  const patterns = [...TEST_NAME_PATTERNS, ...OPTIONAL_PATTERNS]

  const { data: projects, error: projErr } = await supabase
    .from('projects')
    .select('id, name, metadata')
    .eq('type', 'drywall')
    .order('updated_at', { ascending: false })
    .limit(500)

  if (projErr) throw projErr

  const matched = []
  for (const pattern of patterns) {
    const row = (projects || []).find((p) =>
      String(p.name || '').toLowerCase().includes(pattern.toLowerCase()),
    )
    if (!row) {
      if (!OPTIONAL_PATTERNS.includes(pattern)) {
        console.warn(`WARN: test project not found: ${pattern}`)
      }
      continue
    }
    const legacyQuote = row.metadata?.legacy?.quote
    const v2 = resolveV2QuotePayload(legacyQuote)
    if (!v2) {
      console.warn(`WARN: no v2 quote payload for ${row.name}`)
      continue
    }
    matched.push({ id: row.id, name: row.name, v2Quote: v2 })
  }

  const { data: catRow, error: catErr } = await supabase
    .from('org_drywall_catalogs')
    .select('payload')
    .limit(1)
    .maybeSingle()

  if (catErr) throw catErr
  if (!catRow?.payload) {
    throw new Error('No org_drywall_catalogs row found')
  }

  return { projects: matched, catalogsPayload: catRow.payload }
}

function loadFixtures(path) {
  const full = resolve(root, path)
  if (!existsSync(full)) {
    throw new Error(`Fixtures file not found: ${full}`)
  }
  return JSON.parse(readFileSync(full, 'utf8'))
}

async function main() {
  let payload
  if (fixturesPath) {
    console.log(`Loading fixtures: ${fixturesPath}`)
    payload = loadFixtures(fixturesPath)
  } else {
    console.log('Fetching projects + catalogs from Supabase (read-only)…')
    payload = await fetchFromSupabase()
  }

  const tmp = resolve(root, 'scripts/.parity-payload.tmp.json')
  const { writeFileSync, unlinkSync } = await import('fs')
  writeFileSync(tmp, JSON.stringify(payload))

  const nodeArgs = ['test', '--', '--run', 'scripts/quote-v3-parity.harness.test.ts']
  const result = spawnSync('npm', nodeArgs, {
    stdio: 'inherit',
    cwd: root,
    env: { ...process.env, PARITY_PAYLOAD_PATH: tmp },
    shell: true,
  })

  try {
    unlinkSync(tmp)
  } catch {
    /* ignore */
  }

  process.exit(result.status ?? 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

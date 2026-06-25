/**
 * Stale v3 convert audit — lists projects needing refresh after Q.C.4 convert fixes.
 *
 *   node scripts/stale-v3-convert-audit.mjs
 *   node scripts/stale-v3-convert-audit.mjs --preview
 *   node scripts/stale-v3-convert-audit.mjs --apply
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const ORG_ID = 'b80516ed-a8aa-4b6c-bdf8-2155e18a0129'

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
const mode = process.argv.includes('--apply')
  ? 'apply'
  : process.argv.includes('--preview')
    ? 'preview'
    : 'audit'

async function fetchProjects() {
  const url = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')

  const supabase = createClient(url, key)
  const { data: projects, error: projErr } = await supabase
    .from('projects')
    .select('id, name, metadata')
    .eq('type', 'drywall')
    .eq('organization_id', ORG_ID)
    .limit(500)

  if (projErr) throw projErr

  const matched = (projects ?? [])
    .map((row) => {
      const quote = row.metadata?.legacy?.quote
      if (!quote || typeof quote !== 'object') return null
      if (quote.version !== 3 || !quote.legacyV2Snapshot) return null
      return { id: row.id, name: row.name, quote }
    })
    .filter(Boolean)

  const { data: catRow, error: catErr } = await supabase
    .from('org_drywall_catalogs')
    .select('payload')
    .limit(1)
    .maybeSingle()

  let catalogsPayload = catRow?.payload
  if (catErr || !catalogsPayload) {
    console.warn('WARN: live org_drywall_catalogs unavailable — using parity fixture catalogs')
    catalogsPayload = JSON.parse(
      readFileSync(resolve(root, 'scripts/fixtures/quote-v3-parity-fixtures.json'), 'utf8'),
    ).catalogsPayload
  }

  return { projects: matched, catalogsPayload, orgId: ORG_ID }
}

const payloadArg = process.argv.find((a) => a.startsWith('--payload'))
const payloadPathArg = payloadArg?.includes('=')
  ? payloadArg.split('=')[1]
  : payloadArg
    ? process.argv[process.argv.indexOf('--payload') + 1]
    : null

async function main() {
  let payload
  if (payloadPathArg) {
    console.log(`Loading payload: ${payloadPathArg}`)
    payload = JSON.parse(readFileSync(resolve(root, payloadPathArg), 'utf8'))
  } else {
    console.log(`Fetching v3+snapshot projects for org ${ORG_ID}…`)
    payload = await fetchProjects()
  }
  console.log(`Found ${payload.projects.length} converted project(s). Mode: ${mode}`)

  const tmp = resolve(root, 'scripts/.stale-convert-payload.tmp.json')
  const { writeFileSync, unlinkSync } = await import('fs')
  writeFileSync(tmp, JSON.stringify(payload))

  const result = spawnSync(
    'npm',
    ['test', '--', '--run', 'scripts/stale-v3-convert-backfill.harness.test.ts'],
    {
      stdio: 'inherit',
      cwd: root,
      env: {
        ...process.env,
        STALE_CONVERT_PAYLOAD_PATH: tmp,
        STALE_CONVERT_MODE: mode,
      },
      shell: true,
    },
  )

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

/**
 * Build a parity harness payload for ONE live project (reads .env, service role).
 *   PARITY_PROJECT_ID=<uuid> node scripts/build-parity-payload-for-project.mjs
 * Then:
 *   PARITY_PAYLOAD_PATH=scripts/.parity-payload.tmp.json npx vitest run scripts/quote-v3-parity.harness.test.ts
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const ORG_ID = 'b80516ed-a8aa-4b6c-bdf8-2155e18a0129'
const PROJECT_ID = process.env.PARITY_PROJECT_ID || 'd24c8677-6967-4ccd-ae37-852ccc8c5d87'

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

async function main() {
  const url = env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  const supabase = createClient(url, key)

  const { data: proj, error: pErr } = await supabase
    .from('projects')
    .select('name, metadata')
    .eq('id', PROJECT_ID)
    .eq('organization_id', ORG_ID)
    .maybeSingle()
  if (pErr) throw pErr
  if (!proj) throw new Error(`Project not found: ${PROJECT_ID}`)

  const legacy = proj.metadata?.legacy ?? {}
  const v3quote = legacy.quote ?? {}
  const v2Quote = v3quote.legacyV2Snapshot ?? legacy.legacyV2Snapshot
  if (!v2Quote) throw new Error('No legacyV2Snapshot on project — not converted from v2?')

  const { data: cat, error: cErr } = await supabase
    .from('org_drywall_catalogs')
    .select('payload')
    .eq('organization_id', ORG_ID)
    .maybeSingle()
  if (cErr) throw cErr
  const catalogsPayload = cat?.payload ?? {}

  const payload = { projects: [{ id: PROJECT_ID, name: proj.name, v2Quote }], catalogsPayload }
  const outPath = resolve(__dirname, '.parity-payload.tmp.json')
  writeFileSync(outPath, JSON.stringify(payload, null, 2))

  const calc = v2Quote?.calculations ?? {}
  console.log('Wrote', outPath)
  console.log('Project:', proj.name)
  console.log('v2 calc finalTotal:', calc.finalTotal ?? calc.calculatedTotal ?? '(none)')
  console.log('v2 material subtotal:', calc.totalMaterialCost ?? '(none)')
  console.log('v2 component material:', {
    metalStud: calc.metalStudMaterialCost,
    suspendedGrid: calc.suspendedGridMaterialCost,
    insulation: calc.insulationMaterialCost,
    acoustic: calc.acousticCeilingMaterialCost,
    rcChannel: calc.rcChannelMaterialCost,
    frp: calc.frpMaterialCost,
  })
  console.log('v2 includes:', {
    rc: v2Quote.includeRcChannel, ins: v2Quote.includeInsulation, ac: v2Quote.includeAcousticCeiling,
    ms: v2Quote.includeMetalStudFraming, grid: v2Quote.includeSuspendedGrid, frp: v2Quote.includeFRP,
  })
}

main().catch((e) => { console.error(e); process.exit(1) })

/**
 * Apply stale v3 convert refresh using service role (reads .env).
 *
 *   node scripts/apply-stale-convert.mjs --payload scripts/.stale-apply-payload.json
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

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
const payloadArg = process.argv.find((a) => a.startsWith('--payload'))
const payloadPath = payloadArg?.includes('=')
  ? payloadArg.split('=')[1]
  : payloadArg
    ? process.argv[process.argv.indexOf('--payload') + 1]
    : 'scripts/.stale-apply-payload.json'

async function main() {
  const url = env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')

  const applies = JSON.parse(readFileSync(resolve(root, payloadPath), 'utf8'))
  const supabase = createClient(url, key)

  for (const item of applies) {
    const { data: row, error: fetchErr } = await supabase
      .from('projects')
      .select('metadata')
      .eq('id', item.id)
      .eq('organization_id', ORG_ID)
      .maybeSingle()

    if (fetchErr) throw fetchErr
    if (!row?.metadata) throw new Error(`Project not found: ${item.name}`)

    const prevMeta = row.metadata
    const prevLegacy = prevMeta.legacy ?? {}
    const mergedLegacy = {
      ...prevLegacy,
      [item.archiveKey]: item.archiveQuote,
      quote: item.refreshedQuote,
      updatedAt: new Date().toISOString(),
    }
    const mergedMeta = { ...prevMeta, legacy: mergedLegacy }

    const { error: updateErr } = await supabase
      .from('projects')
      .update({ metadata: mergedMeta, updated_at: new Date().toISOString() })
      .eq('id', item.id)
      .eq('organization_id', ORG_ID)

    if (updateErr) throw updateErr
    console.log(`Applied: ${item.name} (${item.id}) — $${item.liveTotal.toFixed(2)} → $${item.freshTotal.toFixed(2)}`)
  }

  console.log(`Done. ${applies.length} project(s) refreshed.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

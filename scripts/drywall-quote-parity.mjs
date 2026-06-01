/**
 * Spot-check quote math vs stored calculations.finalTotal (drywall prod shape).
 * Usage: node scripts/drywall-quote-parity.mjs
 * Requires VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env (or env vars).
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

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
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const NAMES = ['Goodwill Multi', '158 Sherman St', 'Hartville - Irwin']

const supabase = createClient(url, key)

// Dynamic import compiled math — use tsx would be better; inline import from dist won't work.
// Import via relative path to source using experimental — use child_process tsc output instead.
const { buildDrywallQuoteCalculations } = await import('../src/lib/drywall/buildDrywallQuoteCalculations.ts')
const { calculateQuoteTotals } = await import('../src/lib/drywall/quoteCalculations.ts')
const { hydrateDrywallQuote } = await import('../src/lib/drywall/createEmptyDrywallQuote.ts')

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0)
}

const { data, error } = await supabase
  .from('projects')
  .select('id, name, metadata')
  .eq('type', 'drywall')
  .order('updated_at', { ascending: false })
  .limit(500)

if (error) {
  console.error(error)
  process.exit(1)
}

const rows = (data || []).filter((r) =>
  NAMES.some((n) => String(r.name || '').toLowerCase().includes(n.toLowerCase())),
)

console.log('Matched projects:', rows.length)
for (const row of rows) {
  const legacy = row.metadata?.legacy || {}
  const raw = legacy.quote || {}
  const quote = hydrateDrywallQuote(raw)
  const calc = buildDrywallQuoteCalculations(quote)
  const totals = calculateQuoteTotals({ ...quote, version: undefined }, calc)
  const storedFinal =
    raw.calculations?.finalTotal ??
    raw.calculations?.totalQuoteAmount ??
    (parseFloat(String(raw.totalQuoteAmount)) || 0)
  const computed =
    totals.totalQuote ?? calc.finalTotal ?? calc.subtotalAfterProfit ?? 0
  const delta = Math.abs(computed - storedFinal)
  console.log('\n---', row.name, '---')
  console.log('  stored final:', fmt(storedFinal))
  console.log('  recomputed:  ', fmt(computed))
  console.log('  delta:       ', fmt(delta), delta < 1 ? 'OK' : 'CHECK')
}

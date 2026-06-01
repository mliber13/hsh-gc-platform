import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildDrywallQuoteCalculations } from '../src/lib/drywall/buildDrywallQuoteCalculations'
import { calculateQuoteTotals } from '../src/lib/drywall/quoteCalculations'
import { hydrateDrywallQuote } from '../src/lib/drywall/createEmptyDrywallQuote'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnv(): Record<string, string> {
  try {
    const raw = readFileSync(resolve(root, '.env'), 'utf8')
    const env: Record<string, string> = {}
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
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing Supabase env')
  process.exit(1)
}

const NAME_PATTERNS = [/goodwill/i, /sherman/i, /hartville/i, /irwin/i]
const supabase = createClient(url, key)

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0)

async function main() {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, metadata')
    .eq('type', 'drywall')
    .order('updated_at', { ascending: false })
    .limit(500)

  if (error) throw error

  const rows = (data || []).filter((r) =>
    NAME_PATTERNS.some((re) => re.test(String(r.name || ''))),
  )

  console.log('Matched projects:', rows.length)
  for (const row of rows) {
    const meta = row.metadata as { legacy?: { quote?: Record<string, unknown> } } | null
    const raw = meta?.legacy?.quote || {}
    const quote = hydrateDrywallQuote(raw)
    const calc = buildDrywallQuoteCalculations(quote)
    const totals = calculateQuoteTotals({ ...quote, version: undefined }, calc)
    const storedFinal =
      (raw.calculations as { finalTotal?: number })?.finalTotal ??
      (raw.calculations as { totalQuoteAmount?: number })?.totalQuoteAmount ??
      (parseFloat(String(raw.totalQuoteAmount)) || 0)
    const computed =
      (totals.totalQuote as number) ??
      (calc.finalTotal as number) ??
      (calc.subtotalAfterProfit as number) ??
      0
    const delta = Math.abs(computed - storedFinal)
    console.log('\n---', row.name, '---')
    console.log('  stored final:', fmt(storedFinal))
    console.log('  recomputed:  ', fmt(computed))
    console.log('  delta:       ', fmt(delta), delta < 1 ? 'OK' : 'CHECK')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

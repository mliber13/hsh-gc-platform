/**
 * Idempotent seed: Restaurant Structural Renovation estimate template.
 * Run: node scripts/seed-restaurant-structural-template.mjs
 * Requires SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL in .env
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
}

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const SLUG = 'restaurant-structural-renovation-building-repair'
const NAME = 'Restaurant Structural Renovation / Building Repair'
const DESCRIPTION =
  'Starter estimate book for restaurant structural renovation and building repair. Line items use placeholder quantities (0) and starter labor/material unit rates — adjust after subcontractor feedback.'

const trades = JSON.parse(
  execSync('node scripts/generate-restaurant-structural-template-json.mjs', {
    cwd: root,
    encoding: 'utf8',
  })
)

const supabase = createClient(url, key, { auth: { persistSession: false } })

const { data: orgs, error: orgErr } = await supabase.from('organizations').select('id')
if (orgErr) throw orgErr

let inserted = 0
let skipped = 0

for (const org of orgs ?? []) {
  const { data: existing } = await supabase
    .from('estimate_templates')
    .select('id')
    .eq('organization_id', org.id)
    .eq('slug', SLUG)
    .maybeSingle()

  if (existing) {
    skipped++
    continue
  }

  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('organization_id', org.id)
    .in('role', ['admin', 'editor'])

  if (profErr) throw profErr
  const profile = (profiles ?? []).sort((a, b) => {
    if (a.role === 'admin' && b.role !== 'admin') return -1
    if (b.role === 'admin' && a.role !== 'admin') return 1
    return 0
  })[0]

  if (!profile) {
    console.warn(`Skip org ${org.id}: no admin/editor profile`)
    continue
  }

  const { error } = await supabase.from('estimate_templates').insert({
    user_id: profile.id,
    organization_id: org.id,
    name: NAME,
    description: DESCRIPTION,
    slug: SLUG,
    trades,
    default_markup_percent: 11.1,
    default_contingency_percent: 10,
    usage_count: 0,
    linked_plan_ids: [],
  })

  if (error) {
    console.error(`Failed org ${org.id}:`, error.message)
    process.exit(1)
  }
  inserted++
}

console.log(`Done. inserted=${inserted} skipped=${skipped} trade_lines=${trades.length}`)

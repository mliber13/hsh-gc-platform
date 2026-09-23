/**
 * Prove page-held vs save-time-reread concurrency.
 * load  — capture PostgREST updated_at (what a page would hold)
 * fresh — persist-shaped UPDATE using a save-time re-read (part 1 behavior)
 * held  — persist-shaped UPDATE using the captured string (part 2 behavior)
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PROJECT_ID = '6812c1be-34d4-491a-98fe-d7eb6eca625f'
const STATE_PATH = resolve('scripts/.prove-page-held-state.json')

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing supabase url/key in env')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const phase = process.argv[2] || 'load'

if (phase === 'load') {
  const { data, error } = await supabase
    .from('projects')
    .select('id, organization_id, name, updated_at')
    .eq('id', PROJECT_ID)
    .maybeSingle()
  if (error || !data) {
    console.error('load failed', error)
    process.exit(1)
  }
  writeFileSync(STATE_PATH, JSON.stringify(data, null, 2))
  console.log(
    JSON.stringify(
      {
        phase: 'load',
        id: data.id,
        name: data.name,
        heldUpdatedAt: data.updated_at,
        heldType: typeof data.updated_at,
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

const state = JSON.parse(readFileSync(STATE_PATH, 'utf8'))

if (phase === 'fresh') {
  const { data: nowRow, error: readErr } = await supabase
    .from('projects')
    .select('id, name, updated_at')
    .eq('id', state.id)
    .maybeSingle()
  if (readErr || !nowRow) {
    console.error('fresh re-read failed', readErr)
    process.exit(1)
  }
  const { data, error } = await supabase
    .from('projects')
    .update({ name: nowRow.name })
    .eq('id', state.id)
    .eq('organization_id', state.organization_id)
    .eq('updated_at', nowRow.updated_at)
    .select('id')
  console.log(
    JSON.stringify(
      {
        phase: 'fresh-reread (part 1 behavior)',
        heldUpdatedAt: state.updated_at,
        freshUpdatedAt: nowRow.updated_at,
        heldEqualsFresh: state.updated_at === nowRow.updated_at,
        error: error ? { message: error.message, code: error.code } : null,
        rowCount: data?.length ?? 0,
        wouldSucceed: !error && (data?.length ?? 0) > 0,
      },
      null,
      2,
    ),
  )
  process.exit(!error && (data?.length ?? 0) > 0 ? 0 : 1)
}

if (phase === 'held') {
  const { data, error } = await supabase
    .from('projects')
    .update({ name: state.name })
    .eq('id', state.id)
    .eq('organization_id', state.organization_id)
    .eq('updated_at', state.updated_at)
    .select('id')
  const empty = !error && (!data || data.length === 0)
  console.log(
    JSON.stringify(
      {
        phase: 'held (part 2 behavior)',
        heldUpdatedAt: state.updated_at,
        error: error ? { message: error.message, code: error.code } : null,
        rowCount: data?.length ?? 0,
        wouldThrowStale: empty,
      },
      null,
      2,
    ),
  )
  process.exit(empty ? 0 : 1)
}

console.error('usage: load | fresh | held')
process.exit(1)

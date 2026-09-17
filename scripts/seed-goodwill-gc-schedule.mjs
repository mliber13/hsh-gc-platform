/**
 * One-time seed: Goodwill Multi's GC schedule from the Buildertrend export.
 *
 * Dry run by default — prints exactly what it would do and writes nothing.
 * `--apply` performs the writes, after saving a rollback file.
 *
 * Decisions are locked in docs/SCHEDULE_UNIFICATION_PLAN.md:
 *  - Rows that duplicate work the drywall division already schedules are SKIPPED.
 *    One piece of work is one row (invariant 7); two rows means two dates, and
 *    they will drift.
 *  - No predecessors. BT's own ties do not reproduce its own dates — framing to
 *    plumbing is FS lag 115, but the gap is neither 115 calendar nor 115 work
 *    days — so the dates are authoritative and the ties are not. Add ties in HSH
 *    deliberately afterwards.
 *  - division = 'gc' on every row.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import XLSX from 'xlsx'

const APPLY = process.argv.includes('--apply')
// The export lives with the other Buildertrend files, outside the app repo.
const XLSX_PATH = '../payroll-recovery-scratch/Schedule_List_E-Goodwill Multi.xlsx'
const PROJECT_ID = 'fc88c4e5-018b-4f89-a635-424184370d12'
const SCHEDULE_ID = '73e15c03-a771-4ed6-a750-407cbf76c9f9'
const ORG_ID = 'b80516ed-a8aa-4b6c-bdf8-2155e18a0129'

/** BT rows that duplicate drywall items already on this project. */
const SKIP_BT_IDS = new Map([
  [4, 'Stock Topout 07-31 — drywall already has it, same date'],
  [5, 'Hang - Topout 08-03 to 08-05 — drywall already has it, same dates'],
  [15, 'drywall 10-05 to 10-23 — summary bar over the whole drywall chain'],
])

/**
 * Buildertrend's spelling to an org_team person id. Jennifer matched outright;
 * Charlie Koon / Charles Koons and Rich Petrock / Richard Petrock are the same
 * people, confirmed by Mark 2026-09-17 — the script would not guess a nickname
 * on its own, because a wrong guess puts the wrong person on a job.
 */
const PERSON_EXACT = new Map([
  ['jenniferarnett', 'ml5j90xplrg9qqfhs1'],
  ['charliekoon', 'ml5i342htibyz0q323o'],
  ['richpetrock', 'ml5i342hja6mb1d8lz'],
])

/** Names that still need a human before they are assigned. */
const PERSON_PROBABLE = new Map()

const OFFICE_TITLES = [/quote meeting/i]

/**
 * Company names collapse to a comparable key. "&" becomes "and" BEFORE the strip:
 * without it "P & D Painting" keys as pdpainting and "P and D Painting" as
 * panddpainting, so the seed created a duplicate company on 2026-09-17 and a unique
 * phone index was what eventually caught it.
 */
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')

const serial = (n) =>
  typeof n === 'number'
    ? new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10)
    : String(n)

function readEnv() {
  return Object.fromEntries(
    fs
      .readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
      }),
  )
}

function readRows() {
  const sheet = XLSX.readFile(XLSX_PATH).Sheets.Schedules
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  return raw
    .slice(2)
    .filter((r) => r[1])
    .map((r) => ({
      btId: Number(r[0]),
      title: String(r[1]).trim(),
      duration: Number(r[5]) || 1,
      start: serial(r[6]),
      end: serial(r[7]),
      assigned: String(r[8] ?? '').trim(),
    }))
}

async function main() {
  const env = readEnv()
  const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const rows = readRows()

  const { data: subs, error: subsError } = await sb
    .from('subcontractors')
    .select('id,name')
    .eq('organization_id', ORG_ID)
  if (subsError) throw new Error(`load subcontractors: ${subsError.message}`)
  const subByNorm = new Map((subs ?? []).map((s) => [norm(s.name), s]))

  // Existing GC rows, so a re-run does not double-seed.
  const { data: existing, error: existingError } = await sb
    .from('schedule_items')
    .select('id,name,start_date,division')
    .eq('project_id', PROJECT_ID)
  if (existingError) throw new Error(`load existing items: ${existingError.message}`)
  const existingGc = new Set(
    (existing ?? [])
      .filter((i) => i.division === 'gc')
      .map((i) => `${norm(i.name)}|${i.start_date}`),
  )

  const toCreateSubs = new Map()
  const planned = []
  const skipped = []
  const needsAHuman = []
  const fuzzySubMatches = []

  /**
   * Buildertrend writes the trading name ("Burkey Plumbing"); the directory may hold a
   * longer one ("Chris Burkey Plumbing"). Exact matching alone would create a duplicate
   * company record, so fall back to containment — and report every fuzzy hit, because
   * containment is a guess and a wrong one puts the wrong sub on a job.
   */
  const findSub = (key, label) => {
    const exact = subByNorm.get(key)
    if (exact) return exact
    if (key.length < 5) return null
    const hit = (subs ?? []).find(
      (s) => norm(s.name).includes(key) || key.includes(norm(s.name)),
    )
    if (hit) fuzzySubMatches.push({ from: label, to: hit.name })
    return hit ?? null
  }

  for (const r of rows) {
    if (SKIP_BT_IDS.has(r.btId)) {
      skipped.push({ ...r, why: SKIP_BT_IDS.get(r.btId) })
      continue
    }
    if (existingGc.has(`${norm(r.title)}|${r.start}`)) {
      skipped.push({ ...r, why: 'already seeded' })
      continue
    }

    const first = r.assigned.split(',')[0].trim()
    const key = norm(first)
    let companyId = null
    let persons = []
    let note = ''

    if (first) {
      const sub = findSub(key, first)
      const person = PERSON_EXACT.get(key)
      const probable = PERSON_PROBABLE.get(key)
      if (sub) {
        companyId = sub.id
      } else if (person) {
        persons = [person]
      } else if (probable) {
        note = `Buildertrend assignee: ${first}`
        needsAHuman.push({ btId: r.btId, title: r.title, from: first, probably: probable.as })
      } else {
        toCreateSubs.set(key, first)
        note = `Buildertrend assignee: ${first}`
      }
    }

    planned.push({
      bt: r,
      companyName: first,
      companyId,
      persons,
      note,
      type: OFFICE_TITLES.some((re) => re.test(r.title)) ? 'office' : 'field',
    })
  }

  console.log(`\n=== Goodwill Multi GC seed ${APPLY ? '(APPLY)' : '(dry run)'} ===`)
  console.log(`BT rows: ${rows.length} | to seed: ${planned.length} | skipped: ${skipped.length}`)

  console.log('\n--- skipped ---')
  for (const s of skipped) console.log(`  #${s.btId} ${s.title} — ${s.why}`)

  if (fuzzySubMatches.length) {
    console.log('\n--- matched to an existing subcontractor by partial name — check these ---')
    for (const m of fuzzySubMatches) console.log(`   "${m.from}" -> ${m.to}`)
  }

  console.log(`\n--- subcontractors to create (${toCreateSubs.size}) ---`)
  for (const name of toCreateSubs.values()) console.log('  ', name)

  if (needsAHuman.length) {
    console.log('\n--- assignees NOT applied: names differ, confirm before assigning ---')
    for (const n of needsAHuman) {
      console.log(`  #${n.btId} ${n.title}: "${n.from}" is probably ${n.probably}`)
    }
  }

  console.log('\n--- rows ---')
  for (const p of planned) {
    const who = p.companyId
      ? 'company'
      : p.persons.length
        ? 'person'
        : p.companyName
          ? `unassigned (${p.companyName})`
          : 'unassigned'
    console.log(
      `  #${String(p.bt.btId).padStart(2)} ${p.bt.start} -> ${p.bt.end} [${p.type}] ` +
        `${p.bt.title.slice(0, 34).padEnd(35)} ${who}`,
    )
  }

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write.\n')
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const rollbackPath = path.join('.', `goodwill-gc-seed-rollback-${stamp}.json`)

  const createdSubs = []
  for (const [key, name] of toCreateSubs) {
    const { data, error } = await sb
      .from('subcontractors')
      .insert({ name, organization_id: ORG_ID, is_active: true, is_internal: false })
      .select('id,name')
      .single()
    if (error) throw new Error(`create subcontractor "${name}": ${error.message}`)
    createdSubs.push(data)
    subByNorm.set(key, data)
  }

  const payload = planned.map((p) => ({
    schedule_id: SCHEDULE_ID,
    project_id: PROJECT_ID,
    organization_id: ORG_ID,
    division: 'gc',
    type: p.type,
    name: p.bt.title,
    start_date: p.bt.start,
    end_date: p.bt.end,
    duration: p.bt.duration,
    status: 'not-started',
    percent_complete: 0,
    assigned_persons: p.persons,
    assigned_company_id:
      p.companyId ?? findSub(norm(p.companyName), p.companyName)?.id ?? null,
    predecessors: [],
    notes: p.note || null,
  }))

  const { data: inserted, error } = await sb
    .from('schedule_items')
    .insert(payload)
    .select('id,name')
  if (error) throw new Error(`insert schedule items: ${error.message}`)

  fs.writeFileSync(
    rollbackPath,
    JSON.stringify(
      { createdSubs, insertedItemIds: (inserted ?? []).map((i) => i.id) },
      null,
      2,
    ),
  )

  console.log(
    `\nCreated ${createdSubs.length} subcontractors and ${inserted.length} schedule items.`,
  )
  console.log(`Rollback ids: ${rollbackPath}\n`)
}

main().catch((err) => {
  console.error('\nFAILED:', err.message, '\n')
  process.exit(1)
})

/**
 * Fill missing contact name / phone on existing subcontractors from a Buildertrend
 * "Subs" export.
 *
 * Dry run by default. `--apply` writes, after saving a rollback file holding the
 * previous value of every field it touches.
 *
 * Only ever fills a field that is currently EMPTY. Buildertrend is not the system of
 * record any more, so a number already in HSH wins over whatever BT still holds.
 *
 * Does NOT create subcontractors. The BT list mixes trade subs with material suppliers
 * (Carter Lumber, Keim, FBM, L & W), and HSH keeps those in a separate Suppliers
 * directory — importing the list wholesale would file them in the wrong one.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import XLSX from 'xlsx'

const APPLY = process.argv.includes('--apply')
const XLSX_PATH = '../payroll-recovery-scratch/Subs.xlsx'

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

/** 10 digits, or nothing. Strips a leading country code. */
function phoneDigits(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  return local.length === 10 ? local : ''
}

const formatPhone = (d) => (d ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : '')

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

async function main() {
  const env = readEnv()
  const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const rows = XLSX.utils
    .sheet_to_json(XLSX.readFile(XLSX_PATH).Sheets.Subs, { header: 1, defval: '' })
    .slice(2)
    .filter((r) => r[0])
    .map((r) => ({
      company: String(r[0]).trim(),
      contact: String(r[3] ?? '').trim(),
      phone: formatPhone(phoneDigits(r[7]) || phoneDigits(r[8])),
    }))

  const { data: subs, error } = await sb
    .from('subcontractors')
    .select('id,name,contact_name,phone')
  if (error) throw new Error(`load subcontractors: ${error.message}`)

  const findSub = (key) => {
    const exact = subs.find((s) => norm(s.name) === key)
    if (exact) return exact
    if (key.length < 5) return null
    return subs.find((s) => norm(s.name).includes(key) || key.includes(norm(s.name))) ?? null
  }

  const updates = []
  const unmatched = []

  for (const row of rows) {
    const sub = findSub(norm(row.company))
    if (!sub) {
      unmatched.push(row)
      continue
    }
    const patch = {}
    const before = {}
    if (!sub.contact_name && row.contact) {
      patch.contact_name = row.contact
      before.contact_name = sub.contact_name ?? null
    }
    if (!sub.phone && row.phone) {
      patch.phone = row.phone
      before.phone = sub.phone ?? null
    }
    if (Object.keys(patch).length) {
      updates.push({ id: sub.id, name: sub.name, btName: row.company, patch, before })
    }
  }

  console.log(`\n=== BT sub contacts ${APPLY ? '(APPLY)' : '(dry run)'} ===`)
  console.log(`BT rows: ${rows.length} | directory: ${subs.length} | to update: ${updates.length}`)

  console.log('\n--- fills ---')
  for (const u of updates) {
    const from = u.name === u.btName ? '' : `  (BT: "${u.btName}")`
    console.log(`  ${u.name.padEnd(30)} ${JSON.stringify(u.patch)}${from}`)
  }

  console.log(`\n--- in BT, no match in the directory: ${unmatched.length} (not created) ---`)

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write.\n')
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const rollbackPath = path.join('.', `bt-sub-contacts-rollback-${stamp}.json`)
  fs.writeFileSync(
    rollbackPath,
    JSON.stringify(
      updates.map((u) => ({ id: u.id, name: u.name, before: u.before })),
      null,
      2,
    ),
  )

  for (const u of updates) {
    const { error: updateError } = await sb
      .from('subcontractors')
      .update(u.patch)
      .eq('id', u.id)
    if (updateError) throw new Error(`update ${u.name}: ${updateError.message}`)
  }

  console.log(`\nUpdated ${updates.length} subcontractors.`)
  console.log(`Previous values: ${rollbackPath}\n`)
}

main().catch((err) => {
  console.error('\nFAILED:', err.message, '\n')
  process.exit(1)
})

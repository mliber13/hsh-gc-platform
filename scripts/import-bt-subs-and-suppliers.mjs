/**
 * Create the Buildertrend companies that HSH does not have yet, filed into the right
 * directory — trade subs into `subcontractors`, material vendors into `suppliers`.
 *
 * Dry run by default. `--apply` writes, after saving a rollback file naming every id
 * it created.
 *
 * Classification is an explicit list, not a name pattern. "Supply" and "Lumber" happen
 * to catch most vendors, but a rule that guesses would file Ohio Valley Drywall (a sub)
 * as a supplier and cannot know that The Homeworks and Insulatoin Barn share a phone.
 * Anything not on either list is SKIPPED and reported, so a company nobody classified
 * never lands somewhere by default.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import XLSX from 'xlsx'

const APPLY = process.argv.includes('--apply')
const XLSX_PATH = '../payroll-recovery-scratch/Subs.xlsx'
const ORG_ID = 'b80516ed-a8aa-4b6c-bdf8-2155e18a0129'

/** Material vendors — they belong in Suppliers, which is where ordering reads from. */
const SUPPLIERS = new Set([
  'Baird Brothers',
  'Carter Lumber',
  'JWB',
  'Keim Lumber',
  'MEDINA DRYWALL SUPPLY',
  'Trumbull Industries',
])

/** Buildertrend spelling to the name HSH should hold. */
const RENAME = new Map([['Insulatoin Barn', 'Insulation Barn']])

/** Trade subs and site services. */
const SUBS = new Set([
  'Clayton Heating',
  'Country Roofing & Exteriors',
  'Economy Pest Control',
  'Exact Pro Wash',
  'Forever Lawn',
  'Harter Tree Service',
  'Insulatoin Barn',
  'J Andrew Doors',
  'Jason Smith HVAC',
  'Josh-(Gutter guy)',
  'K & A Painting',
  'Kathy Diddle Painting',
  'LGC Painting',
  'Nationwide Site Services',
  'Ohio Valley Drywall',
  'Patterson Specialty Services',
  'SCI Roofing Services',
  'Tema roofing',
  'Town and Country',
  'Youngstown Granite',
])

/** Deliberately not imported, with the reason shown in the dry run. */
const SKIP = new Map([
  ['Century 21', 'a real-estate brokerage — neither a sub nor a supplier'],
  ['Shelter Brothers', 'nothing to classify it by, and Mark does not need it'],
  ['The Homeworks', 'the same outfit as Insulation Barn; HSH keeps the one name'],
  ['FBM Commercial', 'HSH no longer works with FBM'],
  ['FBM Residential', 'HSH no longer works with FBM'],
  ['L & W Supply', 'already in Suppliers as L&W Supply'],
  ['L & W Supply Wadsworth', 'the same L&W under a branch name — its contact fills the existing record'],
  ['ME Supply', 'already in Suppliers'],
])

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')

function phoneOf(cell, tel) {
  for (const value of [cell, tel]) {
    const digits = String(value ?? '').replace(/\D/g, '')
    const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
    if (local.length === 10) return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`
  }
  return ''
}

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
      phone: phoneOf(r[7], r[8]),
    }))

  const { data: subs } = await sb.from('subcontractors').select('id,name,phone')
  const { data: suppliers } = await sb.from('suppliers').select('id,name,phone')

  const has = (list, key) =>
    list.some((x) => norm(x.name) === key) ||
    (key.length >= 5 && list.some((x) => norm(x.name).includes(key) || key.includes(norm(x.name))))

  // A phone already in use would trip the unique index, so surface it here instead.
  const phonesInUse = new Map()
  for (const s of subs) if (s.phone) phonesInUse.set(s.phone, `sub: ${s.name}`)
  for (const s of suppliers) if (s.phone) phonesInUse.set(s.phone, `supplier: ${s.name}`)

  const newSubs = []
  const newSuppliers = []
  const skipped = []
  const unclassified = []
  const alreadyPresent = []

  for (const row of rows) {
    const key = norm(row.company)
    // Report a loose match rather than skip in silence — that is exactly where a
    // duplicate, or a branch worth its own record, hides.
    const inSubs = has(subs, key)
    const inSuppliers = has(suppliers, key)
    if (inSubs || inSuppliers) {
      if (inSuppliers) alreadyPresent.push({ ...row, where: 'suppliers' })
      continue
    }

    if (SKIP.has(row.company)) {
      skipped.push({ ...row, why: SKIP.get(row.company) })
      continue
    }
    const clash = row.phone ? phonesInUse.get(row.phone) : null
    const record = {
      ...row,
      company: RENAME.get(row.company) ?? row.company,
      phone: clash ? '' : row.phone,
      clash,
    }
    if (clash) phonesInUse.delete(row.phone)

    if (SUPPLIERS.has(row.company)) newSuppliers.push(record)
    else if (SUBS.has(row.company)) newSubs.push(record)
    else unclassified.push(row)
    if (record.phone) phonesInUse.set(record.phone, `new: ${row.company}`)
  }

  console.log(`\n=== BT companies ${APPLY ? '(APPLY)' : '(dry run)'} ===`)
  console.log(
    `subs to create: ${newSubs.length} | suppliers to create: ${newSuppliers.length} | ` +
      `skipped: ${skipped.length} | unclassified: ${unclassified.length}`,
  )

  const show = (label, list) => {
    console.log(`\n--- ${label} ---`)
    for (const r of list) {
      const note = r.clash ? `  (phone dropped, already on ${r.clash})` : ''
      console.log(
        `  ${r.company.slice(0, 30).padEnd(31)} ${String(r.contact || '—').padEnd(18)} ${r.phone || '—'}${note}`,
      )
    }
  }

  show(`subcontractors (${newSubs.length})`, newSubs)
  show(`suppliers (${newSuppliers.length})`, newSuppliers)

  if (alreadyPresent.length) {
    console.log('\n--- already in Suppliers under a similar name — check the contact details ---')
    for (const a of alreadyPresent) {
      console.log(
        `  ${a.company.padEnd(31)} ${String(a.contact || '—').padEnd(18)} ${a.phone || '—'}`,
      )
    }
  }

  console.log('\n--- not imported ---')
  for (const s of skipped) console.log(`  ${s.company.padEnd(31)} ${s.why}`)

  if (unclassified.length) {
    console.log('\n--- UNCLASSIFIED, nothing written for these ---')
    for (const u of unclassified) console.log(`  ${u.company}`)
  }

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write.\n')
    return
  }

  const created = { subcontractors: [], suppliers: [] }
  const filled = []

  // L&W Supply is one vendor; Buildertrend lists it twice, plain and by branch. HSH keeps
  // the single record, and it has no contact at all — fill it from the Wadsworth branch,
  // which is the one that shows up on HSH's own schedule as the stock supplier.
  const lw = suppliers.find((s) => norm(s.name) === norm('L&W Supply'))
  const lwSource = rows.find((r) => r.company === 'L & W Supply Wadsworth')
  if (lw && lwSource) {
    const { data: current } = await sb
      .from('suppliers')
      .select('contact_name,phone')
      .eq('id', lw.id)
      .single()
    const patch = {}
    if (!current?.contact_name && lwSource.contact) patch.contact_name = lwSource.contact
    if (!current?.phone && lwSource.phone) patch.phone = lwSource.phone
    if (Object.keys(patch).length) {
      const { error } = await sb.from('suppliers').update(patch).eq('id', lw.id)
      if (error) throw new Error(`fill L&W Supply: ${error.message}`)
      filled.push({ id: lw.id, name: lw.name, before: current, patch })
    }
  }

  for (const r of newSubs) {
    const { data, error } = await sb
      .from('subcontractors')
      .insert({
        name: r.company,
        organization_id: ORG_ID,
        contact_name: r.contact || null,
        phone: r.phone || null,
        is_active: true,
        is_internal: false,
      })
      .select('id,name')
      .single()
    if (error) throw new Error(`create sub "${r.company}": ${error.message}`)
    created.subcontractors.push(data)
  }

  for (const r of newSuppliers) {
    const { data, error } = await sb
      .from('suppliers')
      .insert({
        name: r.company,
        organization_id: ORG_ID,
        contact_name: r.contact || null,
        phone: r.phone || null,
        is_active: true,
      })
      .select('id,name')
      .single()
    if (error) throw new Error(`create supplier "${r.company}": ${error.message}`)
    created.suppliers.push(data)
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const rollbackPath = path.join('.', `bt-companies-rollback-${stamp}.json`)
  fs.writeFileSync(rollbackPath, JSON.stringify({ ...created, filled }, null, 2))

  console.log(
    `\nCreated ${created.subcontractors.length} subcontractors and ${created.suppliers.length} suppliers.`,
  )
  for (const f of filled) console.log(`Filled ${f.name}: ${JSON.stringify(f.patch)}`)
  console.log(`Rollback ids: ${rollbackPath}\n`)
}

main().catch((err) => {
  console.error('\nFAILED:', err.message, '\n')
  process.exit(1)
})

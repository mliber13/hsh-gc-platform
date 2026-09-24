#!/usr/bin/env node
/**
 * One-off: rebuild Moreland Hills - Neff's field measurement from screenshots.
 *
 * The measurement was typed into the browser and never reached the server — a photo upload
 * left the page holding a stale updated_at, so every save was refused (fixed in e586a07).
 * Mark screenshotted the form before reloading; this transcribes it.
 *
 * Every area's sqft is asserted against the figure the UI showed, so a mistyped quantity
 * fails loudly instead of quietly becoming the measurement of record.
 *
 * Dry run by default. `--apply` writes, after backing up the current takeoff.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'

const PROJECT_ID = '91ce5863-da10-4dab-8f19-3cdb5315bd3e'
const APPLY = process.argv.includes('--apply')

/** boardType, thickness, width, then quantity keyed by board length. */
const AREAS = [
  {
    area: '2nd Floor',
    expectedSqft: 6413,
    specs: [
      ['Standard', '1/2"', '48', { 16: 3, 14: 4, 12: 22, 10: 10, 9: 15, 8: 14 }],
      ['Standard', '1/2"', '54', { 16: 9, 14: 8, 12: 9, 10: 31 }],
      ['Moisture-Resistant', '1/2"', '48', { 12: 1, 10: 7, 8: 6 }],
    ],
  },
  {
    area: '1st Floor',
    expectedSqft: 10292,
    specs: [
      ['Standard', '1/2"', '48', { 16: 13, 14: 24, 12: 58, 10: 69, 9: 19, 8: 42 }],
      ['Moisture-Resistant', '1/2"', '48', { 12: 6, 10: 4, 8: 3 }],
    ],
  },
  {
    area: 'Garage',
    expectedSqft: 1768,
    specs: [
      ['Standard', '5/8"', '48', { 10: 13 }],
      ['Standard', '1/2"', '48', { 12: 9, 10: 18, 8: 3 }],
    ],
  },
  {
    area: 'Basement',
    expectedSqft: 4153,
    specs: [
      ['Standard', '1/2"', '48', { 12: 24, 10: 4, 9: 23, 8: 15 }],
      ['Moisture-Resistant', '1/2"', '48', { 12: 4, 10: 1, 8: 1 }],
      ['Standard', '1/2"', '54', { 12: 6, 10: 21 }],
    ],
  },
]

// The eight auto-calculated rows, in the order the page showed them. Two carried the
// "Edited" badge, so they keep autoCalculated with manuallyEdited set.
const AUTO_ACCESSORIES = [
  ['Joint Compound', 'All Purpose Joint Compound', '40', 'Box', { edited: true }],
  ['Joint Compound', 'Lite Weight Joint Compound', '47', 'Box', {}],
  ['Joint Compound', 'Easy Sand 90', '18', 'Bags', {}],
  ['Fasteners', 'Drywall Screws 1-1/4"', '4', 'Box', { threadType: 'Coarse Thread' }],
  ['Adhesives', 'TiteBond Foam', '4', 'Tube', {}],
  ['Adhesives', 'Spray Adhesive', '1', 'Can', {}],
  ['Tape', "500' Paper Tape", '17', 'Roll', {}],
  ['Tape', "300' Mesh Tape", '1', 'Roll', { edited: true }],
]

/** The seven hand-entered corner bead rows: type, item, length, quantity, unit. */
const MANUAL_ACCESSORIES = [
  ['Corner Bead', 'Splay', "10'", '2', 'pcs'],
  ['Corner Bead', 'Arch', "10'", '10', 'pcs'],
  ['Corner Bead', 'Square Bead', "8'", '45', 'pcs'],
  ['Corner Bead', 'Square Bead', "9'", '20', 'pcs'],
  ['Corner Bead', 'Square Bead', "10'", '30', 'pcs'],
  ['Corner Bead', 'Square Bead', "12'", '12', 'pcs'],
  ['Corner Bead', 'Tearaway', '', '6', 'pcs'],
]

const boardSqft = (width, length, quantity) => (Number(width) / 12) * Number(length) * quantity

function buildMeasurements() {
  return AREAS.map((spec) => {
    const boards = []
    let sqft = 0
    for (const [boardType, thickness, width, byLength] of spec.specs) {
      for (const [length, quantity] of Object.entries(byLength)) {
        boards.push({
          id: randomUUID(),
          boardType,
          thickness,
          width,
          length: String(length),
          quantity: String(quantity),
        })
        sqft += boardSqft(width, length, quantity)
      }
    }
    const rounded = Math.round(sqft)
    if (rounded !== spec.expectedSqft) {
      throw new Error(
        `${spec.area}: rebuilt ${rounded} sqft but the screenshot said ${spec.expectedSqft}`,
      )
    }
    console.log(
      `  ${spec.area.padEnd(12)} ${String(boards.length).padStart(2)} board rows   ${rounded.toLocaleString().padStart(7)} sqft   ok`,
    )
    return { id: randomUUID(), area: spec.area, notes: '', boards }
  })
}

function buildAccessories() {
  const out = AUTO_ACCESSORIES.map(([type, subtype, quantity, unit, extra]) => ({
    id: randomUUID(),
    type,
    subtype,
    quantity,
    unit,
    length: '',
    threadType: extra.threadType ?? '',
    facing: '',
    autoCalculated: true,
    manuallyEdited: Boolean(extra.edited),
  }))
  for (const [type, subtype, length, quantity, unit] of MANUAL_ACCESSORIES) {
    out.push({
      id: randomUUID(),
      type,
      subtype,
      quantity,
      unit,
      length,
      threadType: '',
      facing: '',
      autoCalculated: false,
      manuallyEdited: false,
    })
  }
  return out
}

async function main() {
  const env = Object.fromEntries(
    fs
      .readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
      }),
  )
  const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: project, error } = await sb
    .from('projects')
    .select('name, metadata, updated_at')
    .eq('id', PROJECT_ID)
    .single()
  if (error) throw new Error(error.message)

  const metadata = project.metadata ?? {}
  const legacy = metadata.legacy ?? {}
  const current = legacy.fieldTakeoff ?? {}

  console.log(`\n${project.name}`)
  console.log(
    `current: ${current.measurements?.length ?? 0} area(s), ${current.accessories?.length ?? 0} accessories, ${current.photos?.length ?? 0} photos, ${current.totalMeasuredSqft ?? 0} sqft\n`,
  )

  const measurements = buildMeasurements()
  const accessories = buildAccessories()
  const totalMeasuredSqft = measurements.reduce(
    (total, area) =>
      total + area.boards.reduce((s, b) => s + boardSqft(b.width, b.length, Number(b.quantity)), 0),
    0,
  )

  console.log(
    `\n  accessories  ${accessories.length} (${AUTO_ACCESSORIES.length} auto, ${MANUAL_ACCESSORIES.length} manual)`,
  )
  console.log('  checklist    all 4 marked complete')
  console.log(`  photos       ${current.photos?.length ?? 0} kept as they are`)
  console.log(
    `  TOTAL        ${Math.round(totalMeasuredSqft).toLocaleString()} sqft  (screenshot said 22,626)`,
  )

  if (Math.round(totalMeasuredSqft) !== 22626) {
    throw new Error(`total is ${Math.round(totalMeasuredSqft)}, expected 22,626`)
  }

  const nextTakeoff = {
    ...current,
    measurements,
    accessories,
    checklist: (current.checklist ?? []).map((item) => ({ ...item, completed: true })),
    totalMeasuredSqft,
    updatedAt: new Date().toISOString(),
  }

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write.\n')
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `scripts/neff-takeoff-backup-${stamp}.json`
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      { projectId: PROJECT_ID, updated_at: project.updated_at, fieldTakeoff: current },
      null,
      2,
    ),
  )
  console.log(`\nBackup: ${backupPath}`)

  const { data: written, error: writeError } = await sb
    .from('projects')
    .update({ metadata: { ...metadata, legacy: { ...legacy, fieldTakeoff: nextTakeoff } } })
    .eq('id', PROJECT_ID)
    .eq('updated_at', project.updated_at)
    .select('id')
  if (writeError) throw new Error(writeError.message)
  if (!written || written.length === 0) {
    throw new Error('Project changed while this script was running — re-run it.')
  }

  console.log('Written. Reload the Field Measurement page.\n')
}

main().catch((e) => {
  console.error(`\n${e.message}\n`)
  process.exit(1)
})

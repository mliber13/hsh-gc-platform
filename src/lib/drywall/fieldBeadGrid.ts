/**
 * Corner bead as a profile × stick-length grid, the way board counts work.
 *
 * Storage is deliberately unchanged: bead stays as accessory rows of type "Corner Bead"
 * (subtype = profile, length = stick length, quantity = pieces). The compound calculation
 * (`totalManualCornerBeadQuantity`), the materials order PDF and the crew materials card all
 * read those rows, so only the screen moves. On 2026-10-08 there were 199 such rows across 65
 * jobs, every one in pieces, and no job had the same profile and length twice — so the grid
 * maps onto existing data one cell per row with nothing to merge.
 *
 * Unlike the board grid, changing a profile never drops a count. A length the new profile
 * does not come in (Tearaway is 10' only) is kept and shown as its own tile, because a count
 * silently disappearing from a material order is worse than an odd-looking tile.
 */
import type { FieldAccessoryEntry } from '@/types/drywall'
import { FIELD_MATERIAL_OPTIONS, getLengthOptions } from './fieldAccessoryUi'
import { generateFieldId } from './fieldMeasurementUtils'

export const BEAD_TYPE = 'Corner Bead'

/** Square Bead, Bullnose, Splay, Arch, Tearaway — the accessory picker's list, not a copy. */
export const BEAD_PROFILES: readonly string[] =
  FIELD_MATERIAL_OPTIONS.find((c) => c.category === BEAD_TYPE)?.items ?? []

/** The tile for a legacy row saved without a length (4 live rows on 2026-10-08). */
export const NO_LENGTH = ''

export function isBeadRow(acc: FieldAccessoryEntry): boolean {
  return acc.type === BEAD_TYPE
}

function feet(length: string): number {
  const n = parseFloat(length)
  return Number.isFinite(n) ? n : 0
}

function qtyNumber(raw: unknown): number {
  const n = parseFloat(String(raw ?? ''))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function sameCell(acc: FieldAccessoryEntry, profile: string, length: string): boolean {
  return isBeadRow(acc) && (acc.subtype ?? '') === profile && (acc.length ?? '') === length
}

/** Profiles that have at least one bead row, in the order they first appear. */
export function beadProfilesInUse(accessories: FieldAccessoryEntry[]): string[] {
  const seen: string[] = []
  for (const acc of accessories) {
    if (!isBeadRow(acc)) continue
    const profile = acc.subtype ?? ''
    if (!seen.includes(profile)) seen.push(profile)
  }
  return seen
}

/**
 * The tiles to show for a profile: every length it comes in, plus any length already saved
 * for it that it does not come in — so no stored count is ever hidden. Shortest first, the
 * way the board grid reads; the no-length tile, if any, last.
 */
export function beadTileLengths(accessories: FieldAccessoryEntry[], profile: string): string[] {
  const offered = profile ? getLengthOptions(BEAD_TYPE, profile) : []
  const stored = accessories
    .filter((a) => isBeadRow(a) && (a.subtype ?? '') === profile)
    .map((a) => a.length ?? '')
  const all = [...new Set([...offered, ...stored])]
  const real = all.filter((l) => l !== NO_LENGTH).sort((a, b) => feet(a) - feet(b))
  return all.includes(NO_LENGTH) ? [...real, NO_LENGTH] : real
}

/** True when a stored length is not one the profile comes in. */
export function isOffListLength(profile: string, length: string): boolean {
  if (length === NO_LENGTH) return true
  return !getLengthOptions(BEAD_TYPE, profile).includes(length)
}

export function beadQuantity(
  accessories: FieldAccessoryEntry[],
  profile: string,
  length: string,
): string {
  return accessories.find((a) => sameCell(a, profile, length))?.quantity ?? ''
}

/**
 * Set the pieces for one profile/length cell. Clearing (blank, zero, negative) removes the
 * row, the same as the board grid — an empty cell is not stored as a zero.
 */
export function setBeadQuantity(
  accessories: FieldAccessoryEntry[],
  profile: string,
  length: string,
  rawQty: string,
): FieldAccessoryEntry[] {
  const qty = rawQty.trim()
  const cleared = qty === '' || !(Number(qty) > 0)
  const idx = accessories.findIndex((a) => sameCell(a, profile, length))

  if (cleared) {
    return idx < 0 ? accessories : accessories.filter((_, i) => i !== idx)
  }
  if (idx >= 0) {
    return accessories.map((a, i) => (i === idx ? { ...a, quantity: qty } : a))
  }
  return [
    ...accessories,
    {
      id: generateFieldId(),
      type: BEAD_TYPE,
      subtype: profile,
      length,
      quantity: qty,
      unit: 'pcs',
      autoCalculated: false,
      threadType: '',
      facing: '',
    },
  ]
}

/**
 * Move every row of one profile to another. Counts are kept even for lengths the new profile
 * does not come in; if the new profile already has a count at a length, the two are added
 * rather than one overwriting the other.
 */
export function changeBeadProfile(
  accessories: FieldAccessoryEntry[],
  from: string,
  to: string,
): FieldAccessoryEntry[] {
  if (from === to) return accessories
  let next = accessories
  for (const row of accessories.filter((a) => isBeadRow(a) && (a.subtype ?? '') === from)) {
    const length = row.length ?? ''
    const existing = next.find((a) => sameCell(a, to, length))
    next = next.filter((a) => a.id !== row.id)
    if (existing) {
      const sum = qtyNumber(existing.quantity) + qtyNumber(row.quantity)
      next = next.map((a) => (a.id === existing.id ? { ...a, quantity: String(sum) } : a))
    } else {
      next = [...next, { ...row, subtype: to }]
    }
  }
  return next
}

export function removeBeadProfile(
  accessories: FieldAccessoryEntry[],
  profile: string,
): FieldAccessoryEntry[] {
  return accessories.filter((a) => !(isBeadRow(a) && (a.subtype ?? '') === profile))
}

export type BeadTotals = { sticks: number; linearFeet: number }

/** Sticks and linear feet, for one profile or (no profile) for the whole job. */
export function beadTotals(accessories: FieldAccessoryEntry[], profile?: string): BeadTotals {
  let sticks = 0
  let linearFeet = 0
  for (const acc of accessories) {
    if (!isBeadRow(acc)) continue
    if (profile !== undefined && (acc.subtype ?? '') !== profile) continue
    const q = qtyNumber(acc.quantity)
    sticks += q
    linearFeet += q * feet(acc.length ?? '')
  }
  return { sticks, linearFeet }
}

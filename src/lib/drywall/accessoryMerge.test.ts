// The rules the "Recalculate" button depends on.
//
// Field measurement used to rewrite accessories on every change to measured sqft, so the
// form fought the operator as they typed. Recalculating is now a deliberate press, which
// only works if the merge is trustworthy: press it and you must not lose a manual row or a
// quantity you corrected by hand.

import { describe, expect, it } from 'vitest'
import { calculateFieldAccessories, mergeAutoAccessories } from './accessoryCalc'
import type { FieldAccessoryEntry } from '@/types/drywall'

function manual(over: Partial<FieldAccessoryEntry> = {}): FieldAccessoryEntry {
  return {
    id: 'm1',
    type: 'Corner Bead',
    subtype: 'Square Bead',
    unit: 'pcs',
    length: "10'",
    quantity: '40',
    autoCalculated: false,
    ...over,
  } as FieldAccessoryEntry
}

describe('mergeAutoAccessories — what Recalculate promises', () => {
  it('keeps manual rows untouched', () => {
    const existing = [manual()]
    const merged = mergeAutoAccessories(existing, calculateFieldAccessories(10000, 40))
    const kept = merged.find((a) => a.id === 'm1')
    expect(kept).toBeDefined()
    expect(kept!.quantity).toBe('40')
    expect(kept!.autoCalculated).toBe(false)
  })

  it('keeps a quantity the operator corrected by hand', () => {
    // The whole point of the button: pressing it must not silently undo a correction.
    const auto = calculateFieldAccessories(10000, 0)
    const edited = auto.map((a, i) =>
      i === 0 ? { ...a, quantity: '999', manuallyEdited: true } : a,
    )
    const merged = mergeAutoAccessories(edited, calculateFieldAccessories(20000, 0))
    const row = merged.find(
      (a) => a.type === auto[0].type && a.subtype === auto[0].subtype,
    )
    expect(row!.quantity).toBe('999')
  })

  it('updates an untouched auto quantity when the measurements change', () => {
    const before = calculateFieldAccessories(10000, 0)
    const after = calculateFieldAccessories(40000, 0)
    const merged = mergeAutoAccessories(before, after)
    const beforeRow = before.find((a) => a.subtype === 'TiteBond Foam')!
    const mergedRow = merged.find((a) => a.subtype === 'TiteBond Foam')!
    expect(mergedRow.quantity).not.toBe(beforeRow.quantity)
    expect(mergedRow.quantity).toBe(after.find((a) => a.subtype === 'TiteBond Foam')!.quantity)
  })

  it('drops auto rows when there are no measurements left, and keeps manual ones', () => {
    // Recalculating at zero sqft is how an operator clears the calculated set.
    const existing = [...calculateFieldAccessories(10000, 0), manual()]
    const merged = mergeAutoAccessories(existing, [])
    expect(merged.every((a) => !a.autoCalculated)).toBe(true)
    expect(merged.map((a) => a.id)).toContain('m1')
  })

  it('is idempotent — pressing twice changes nothing the second time', () => {
    // This is what makes the "no longer match" prompt trustworthy: once pressed, it goes away.
    const auto = calculateFieldAccessories(15000, 12)
    const once = mergeAutoAccessories(auto, calculateFieldAccessories(15000, 12))
    const twice = mergeAutoAccessories(once, calculateFieldAccessories(15000, 12))
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once))
  })

  it('reports a difference exactly when the measurements moved', () => {
    // The staleness prompt is this comparison; if it were wrong the operator would either be
    // nagged forever or never told.
    const current = calculateFieldAccessories(10000, 0)
    const same = mergeAutoAccessories(current, calculateFieldAccessories(10000, 0))
    expect(JSON.stringify(same)).toBe(JSON.stringify(current))

    const moved = mergeAutoAccessories(current, calculateFieldAccessories(30000, 0))
    expect(JSON.stringify(moved)).not.toBe(JSON.stringify(current))
  })

  it('returns nothing to merge when sqft is zero', () => {
    expect(calculateFieldAccessories(0, 0)).toEqual([])
  })
})

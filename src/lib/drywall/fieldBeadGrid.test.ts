/**
 * The bead grid writes the same accessory rows the old Accessories UI did, so everything
 * downstream (compound calc, order PDF, crew materials) is untouched. These tests hold it to
 * that, and to the one place it deliberately differs from the board grid: no count is lost
 * when a profile changes.
 */
import { describe, expect, it } from 'vitest'
import { totalManualCornerBeadQuantity } from './accessoryCalc'
import type { FieldAccessoryEntry } from '@/types/drywall'
import {
  BEAD_PROFILES,
  BEAD_TYPE,
  NO_LENGTH,
  beadProfilesInUse,
  beadQuantity,
  beadTileLengths,
  beadTotals,
  changeBeadProfile,
  isOffListLength,
  removeBeadProfile,
  setBeadQuantity,
} from './fieldBeadGrid'

function bead(subtype: string, length: string, quantity: string, id = `${subtype}-${length}`) {
  return {
    id,
    type: BEAD_TYPE,
    subtype,
    length,
    quantity,
    unit: 'pcs',
    autoCalculated: false,
    threadType: '',
    facing: '',
  } as FieldAccessoryEntry
}

const screws = {
  id: 'scr',
  type: 'Fasteners',
  subtype: 'Drywall Screws 1-1/4"',
  quantity: '4',
  unit: 'box',
  autoCalculated: true,
} as FieldAccessoryEntry

describe('profiles and tiles', () => {
  it('offers the accessory picker’s profiles', () => {
    expect(BEAD_PROFILES).toEqual(['Square Bead', 'Bullnose', 'Splay', 'Arch', 'Tearaway'])
  })

  it('lists profiles in use, in first-seen order, ignoring other accessories', () => {
    const rows = [screws, bead('Tearaway', "10'", '3'), bead('Square Bead', "8'", '5'), bead('Tearaway', "12'", '1', 't12')]
    expect(beadProfilesInUse(rows)).toEqual(['Tearaway', 'Square Bead'])
  })

  it('shows the lengths a profile comes in, shortest first', () => {
    expect(beadTileLengths([], 'Square Bead')).toEqual(["8'", "9'", "10'", "12'"])
    expect(beadTileLengths([], 'Tearaway')).toEqual(["10'"])
  })

  it('never hides a stored count: off-list lengths and no-length rows get their own tile', () => {
    const rows = [bead('Tearaway', "12'", '2'), bead('Tearaway', NO_LENGTH, '1', 'tn')]
    expect(beadTileLengths(rows, 'Tearaway')).toEqual(["10'", "12'", NO_LENGTH])
    expect(isOffListLength('Tearaway', "12'")).toBe(true)
    expect(isOffListLength('Tearaway', "10'")).toBe(false)
    expect(isOffListLength('Square Bead', NO_LENGTH)).toBe(true)
  })
})

describe('setting a count', () => {
  it('adds a row shaped exactly like the old manual accessory row', () => {
    const next = setBeadQuantity([screws], 'Square Bead', "10'", '12')
    expect(next).toHaveLength(2)
    const row = next[1]
    expect(row).toMatchObject({
      type: BEAD_TYPE,
      subtype: 'Square Bead',
      length: "10'",
      quantity: '12',
      unit: 'pcs',
      autoCalculated: false,
    })
    expect(next[0]).toBe(screws)
  })

  it('updates the existing cell rather than adding a second', () => {
    const rows = [bead('Square Bead', "10'", '12')]
    const next = setBeadQuantity(rows, 'Square Bead', "10'", '15')
    expect(next).toHaveLength(1)
    expect(next[0].quantity).toBe('15')
    expect(next[0].id).toBe(rows[0].id)
  })

  it('removes the row when the cell is cleared or zeroed', () => {
    const rows = [bead('Square Bead', "10'", '12')]
    expect(setBeadQuantity(rows, 'Square Bead', "10'", '')).toEqual([])
    expect(setBeadQuantity(rows, 'Square Bead', "10'", '0')).toEqual([])
    expect(setBeadQuantity(rows, 'Square Bead', "10'", '-3')).toEqual([])
  })

  it('reads a cell back', () => {
    const rows = [bead('Arch', "8'", '4')]
    expect(beadQuantity(rows, 'Arch', "8'")).toBe('4')
    expect(beadQuantity(rows, 'Arch', "10'")).toBe('')
  })
})

describe('changing and removing a profile', () => {
  it('relabels every row and keeps counts the new profile does not come in', () => {
    const rows = [screws, bead('Square Bead', "12'", '6'), bead('Square Bead', "10'", '4')]
    const next = changeBeadProfile(rows, 'Square Bead', 'Tearaway')
    expect(beadQuantity(next, 'Tearaway', "12'")).toBe('6')
    expect(beadQuantity(next, 'Tearaway', "10'")).toBe('4')
    expect(beadProfilesInUse(next)).toEqual(['Tearaway'])
    expect(next).toContain(screws)
  })

  it('adds into an existing cell instead of overwriting it', () => {
    const rows = [bead('Splay', "10'", '3'), bead('Arch', "10'", '2')]
    const next = changeBeadProfile(rows, 'Splay', 'Arch')
    expect(beadQuantity(next, 'Arch', "10'")).toBe('5')
    expect(beadProfilesInUse(next)).toEqual(['Arch'])
  })

  it('removes only that profile’s rows', () => {
    const rows = [screws, bead('Splay', "10'", '3'), bead('Arch', "10'", '2')]
    expect(removeBeadProfile(rows, 'Splay')).toEqual([screws, rows[2]])
  })
})

describe('totals', () => {
  const rows = [screws, bead('Square Bead', "10'", '12'), bead('Square Bead', "8'", '5'), bead('Tearaway', "10'", '3')]

  it('counts sticks and linear feet per profile and for the job', () => {
    expect(beadTotals(rows, 'Square Bead')).toEqual({ sticks: 17, linearFeet: 160 })
    expect(beadTotals(rows)).toEqual({ sticks: 20, linearFeet: 190 })
  })

  /**
   * The compound calc sizes Easy Sand 90 / Lite Weight off the bead count. Moving bead to its
   * own section must not change the number it sees.
   */
  it('agrees with the compound calculation’s bead count', () => {
    expect(beadTotals(rows).sticks).toBe(totalManualCornerBeadQuantity(rows))
    const edited = setBeadQuantity(rows, 'Arch', "9'", '7')
    expect(beadTotals(edited).sticks).toBe(totalManualCornerBeadQuantity(edited))
  })
})

/**
 * Insulation on the field measurement sheet: R-11 exists, and facing is picked
 * separately from the R-value so a takeoff can say which one to load.
 */
import { describe, expect, it } from 'vitest'
import {
  getFacingOptions,
  getSubtypeOptions,
  shouldShowFacing,
} from './fieldAccessoryUi'
import { formatAccessoryLineDescription } from './fieldMaterialsPdfData'

describe('insulation items', () => {
  it('offers R-11 batts', () => {
    expect(getSubtypeOptions('Insulation')).toContain('R-11 Batts')
  })

  it('still offers everything it did before', () => {
    const items = getSubtypeOptions('Insulation')
    for (const item of [
      'R-13 Batts',
      'R-19 Batts',
      'R-21 Batts',
      'R-30 Batts',
      'R-38 Batts',
      'Sound Attenuation Batts',
      'Rigid Insulation 1"',
      'Rigid Insulation 2"',
    ]) {
      expect(items).toContain(item)
    }
  })
})

describe('facing', () => {
  it('applies to batts', () => {
    expect(getFacingOptions('Insulation', 'R-11 Batts')).toEqual(['Unfaced', 'Faced'])
    expect(shouldShowFacing('Insulation', 'Sound Attenuation Batts')).toBe(true)
  })

  it('does not apply to rigid board', () => {
    expect(getFacingOptions('Insulation', 'Rigid Insulation 1"')).toEqual([])
    expect(shouldShowFacing('Insulation', 'Rigid Insulation 2"')).toBe(false)
  })

  it('does not apply to other material categories', () => {
    expect(shouldShowFacing('Corner Bead', 'Square Bead')).toBe(false)
    expect(shouldShowFacing('Fasteners', 'Drywall Screws 1"')).toBe(false)
  })

  it('shows before an item is chosen so the column does not appear late', () => {
    expect(shouldShowFacing('Insulation', '')).toBe(true)
  })
})

describe('the materials list carries facing to the supplier', () => {
  it('names it alongside the R-value', () => {
    expect(
      formatAccessoryLineDescription({
        type: 'Insulation',
        subtype: 'R-11 Batts',
        facing: 'Unfaced',
        length: '',
        threadType: '',
      }),
    ).toBe('R-11 Batts - Unfaced')
  })

  it('leaves a line with no facing exactly as it was', () => {
    expect(
      formatAccessoryLineDescription({
        type: 'Corner Bead',
        subtype: 'Square Bead',
        facing: '',
        length: "10'",
        threadType: '',
      }),
    ).toBe("Square Bead (10')")
  })
})

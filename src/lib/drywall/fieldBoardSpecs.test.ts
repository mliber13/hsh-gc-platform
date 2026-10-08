/**
 * Board sizes offered in field measurement. Cement backer comes in 3x5, 4x8 and 4x10, and never
 * 54" wide (Mark, 2026-10-08), so Cement offers exactly those three sizes. Live takeoffs held
 * only 4x8 cement when this was trimmed, so no saved count went hidden.
 */
import { describe, expect, it } from 'vitest'
import {
  applyBoardFieldChange,
  getAvailableLengths,
  getAvailableWidths,
} from './fieldBoardSpecs'
import { computeMeasuredSqft } from './fieldMeasurementUtils'
import { hangOnlyMeasuredSqft } from './hangOnly'

describe('cement board sizes', () => {
  it('offers exactly 3x5, 4x8 and 4x10', () => {
    for (const thickness of ['1/2', '5/8']) {
      expect(getAvailableWidths('Cement', thickness)).toEqual(['36', '48'])
      expect(getAvailableLengths('Cement', '36', thickness)).toEqual(['5'])
      expect(getAvailableLengths('Cement', '48', thickness)).toEqual(['10', '8'])
    }
  })

  it('drywall sizes are untouched', () => {
    expect(getAvailableWidths('Standard', '1/2')).toEqual(['48', '54'])
    expect(getAvailableLengths('Standard', '48', '1/2')).toEqual(['16', '14', '12', '10', '9', '8'])
    expect(getAvailableLengths('Standard', '54', '1/2')).toEqual(['16', '14', '12', '10'])
    for (const type of ['Standard', 'Moisture-Resistant', 'Fire-Resistant']) {
      expect(getAvailableWidths(type, '1/2')).not.toContain('36')
    }
  })

  it('switching a 3x5 spec to drywall clears the width drywall does not come in', () => {
    const next = applyBoardFieldChange(
      { boardType: 'Cement', thickness: '1/2', width: '36', length: '5' },
      'boardType',
      'Standard',
    )
    expect(next.width).toBe('')
    expect(next.length).toBe('')
  })

  it('switching a 54" drywall spec to Cement clears the width cement does not come in', () => {
    const next = applyBoardFieldChange(
      { boardType: 'Standard', thickness: '1/2', width: '54', length: '12' },
      'boardType',
      'Cement',
    )
    expect(next.width).toBe('')
  })

  it('3x5 counts 15 sqft a sheet, 4x10 counts 40, both hang only by default', () => {
    const measurements = [
      {
        id: 'a',
        area: 'Cabin',
        boards: [
          { id: 'b', boardType: 'Cement', thickness: '1/2', width: '36', length: '5', quantity: '10' },
          { id: 'c', boardType: 'Cement', thickness: '1/2', width: '48', length: '10', quantity: '2' },
        ],
      },
    ]
    expect(computeMeasuredSqft(measurements)).toBe(230)
    expect(hangOnlyMeasuredSqft(measurements)).toBe(230)
  })
})

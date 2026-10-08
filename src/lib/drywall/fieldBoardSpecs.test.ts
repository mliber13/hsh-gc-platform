/**
 * Board sizes offered in field measurement. Hardi / cement backer comes in 3x5 sheets as well
 * as 4x8 (Mark, 2026-10-08), so Cement offers a 36" width with a 5' length — and only Cement.
 */
import { describe, expect, it } from 'vitest'
import {
  applyBoardFieldChange,
  getAvailableLengths,
  getAvailableWidths,
} from './fieldBoardSpecs'
import { computeMeasuredSqft } from './fieldMeasurementUtils'
import { hangOnlyMeasuredSqft } from './hangOnly'

describe('cement board 3x5', () => {
  it('is offered for Cement, at 5 feet only', () => {
    expect(getAvailableWidths('Cement', '1/2')).toContain('36')
    expect(getAvailableLengths('Cement', '36', '1/2')).toEqual(['5'])
  })

  it('still offers the 4-foot sheets', () => {
    expect(getAvailableWidths('Cement', '1/2')).toContain('48')
    expect(getAvailableLengths('Cement', '48', '1/2')).toContain('8')
  })

  it('is not offered for drywall', () => {
    for (const type of ['Standard', 'Moisture-Resistant', 'Fire-Resistant']) {
      expect(getAvailableWidths(type, '1/2')).not.toContain('36')
    }
  })

  it('switching a 3x5 spec to drywall clears the width that drywall does not come in', () => {
    const next = applyBoardFieldChange(
      { boardType: 'Cement', thickness: '1/2', width: '36', length: '5' },
      'boardType',
      'Standard',
    )
    expect(next.width).toBe('')
    expect(next.length).toBe('')
  })

  it('counts 15 sqft a sheet, and as hang only by default', () => {
    const measurements = [
      {
        id: 'a',
        area: 'Cabin',
        boards: [
          { id: 'b', boardType: 'Cement', thickness: '1/2', width: '36', length: '5', quantity: '10' },
        ],
      },
    ]
    expect(computeMeasuredSqft(measurements)).toBe(150)
    expect(hangOnlyMeasuredSqft(measurements)).toBe(150)
  })
})

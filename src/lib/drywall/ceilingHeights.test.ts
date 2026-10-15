import { describe, expect, it } from 'vitest'
import { heightBand, parseHeightFt, tallSqftByBand } from './ceilingHeights'
import { mergeFieldTakeoff } from './fieldMeasurementUtils'
import type { FieldMeasurementArea, FieldTakeoff } from '@/types/drywall'

// 4×12 sheets = 48 sqft each.
const area = (id: string, heightFt: number | undefined, sheets: number): FieldMeasurementArea => ({
  id,
  area: id,
  boards: [{ id: `${id}-b`, boardType: 'Drywall', thickness: '1/2', width: '48', length: '12', quantity: String(sheets) }],
  ...(heightFt === undefined ? {} : { heightFt }),
})

describe('ceiling heights', () => {
  it('only 10 ft and up is tall (Mark, 2026-10-15)', () => {
    expect(heightBand(undefined)).toBeNull()
    expect(heightBand(8)).toBeNull()
    expect(heightBand(9.5)).toBeNull()
    expect(heightBand(10)).toBe('10-11')
    expect(heightBand(11.5)).toBe('10-11')
    expect(heightBand(12)).toBe('12-14')
    expect(heightBand(18)).toBe('15+')
  })

  it('tall sqft is counted per band from the measured areas', () => {
    const areas = [area('1st floor', 9, 100), area('Garage', 10, 20), area('Great room', 18, 10), area('Basement', undefined, 50)]
    expect(tallSqftByBand(areas)).toEqual({ '10-11': 960, '15+': 480 })
  })

  it('a typed height is a positive number or nothing', () => {
    expect(parseHeightFt('9')).toBe(9)
    expect(parseHeightFt('10.5')).toBe(10.5)
    expect(parseHeightFt('')).toBeUndefined()
    expect(parseHeightFt('0')).toBeUndefined()
  })

  /** mergeFieldTakeoff rebuilds areas field by field — the allowlist that dropped hangOnly on 10-08. */
  it('an area keeps its height through loading the takeoff', () => {
    const saved = { measurements: [area('Great room', 18, 10), area('1st floor', undefined, 5)] } as unknown as FieldTakeoff
    const loaded = mergeFieldTakeoff(saved)
    expect(loaded.measurements[0].heightFt).toBe(18)
    expect('heightFt' in loaded.measurements[1]).toBe(false)
  })
})

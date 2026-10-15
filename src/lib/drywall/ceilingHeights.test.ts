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

describe('quote heights', () => {
  it('a quote keeps its default height and tall areas through loading', async () => {
    const { hydrateDrywallQuoteV3 } = await import('./createEmptyDrywallQuoteV3')
    const q = hydrateDrywallQuoteV3({
      version: 3,
      default_height_ft: 9,
      tall_areas: [{ id: 'g', name: 'Great room', height_ft: 18, sqft: 800 }],
    })
    expect(q.default_height_ft).toBe(9)
    expect(q.tall_areas).toEqual([{ id: 'g', name: 'Great room', height_ft: 18, sqft: 800 }])
  })

  it('a quote saved before heights existed loads with no height keys at all', async () => {
    const { hydrateDrywallQuoteV3 } = await import('./createEmptyDrywallQuoteV3')
    const q = hydrateDrywallQuoteV3({ version: 3 })
    expect('default_height_ft' in q).toBe(false)
    expect('tall_areas' in q).toBe(false)
  })

  it('the field areas fill the tall rows with their measured sqft', async () => {
    const { tallAreasFromField } = await import('./ceilingHeights')
    const rows = tallAreasFromField([area('1st floor', 9, 100), area('Great room', 18, 10)])
    expect(rows.map(({ name, height_ft, sqft }) => ({ name, height_ft, sqft }))).toEqual([
      { name: 'Great room', height_ft: 18, sqft: 480 },
    ])
  })

  it('tall sqft by band ignores rows under 10 ft or with no sqft', async () => {
    const { quoteTallSqftByBand } = await import('./ceilingHeights')
    expect(
      quoteTallSqftByBand({
        tall_areas: [
          { id: '1', name: 'Garage', height_ft: 10, sqft: 900 },
          { id: '2', name: 'Great room', height_ft: 18, sqft: 800 },
          { id: '3', name: 'Den', height_ft: 9, sqft: 300 },
          { id: '4', name: 'Foyer', height_ft: 16, sqft: 0 },
        ],
      }),
    ).toEqual({ '10-11': 900, '15+': 800 })
  })
})

import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { heightBand, parseHeightFt, quoteAreasForField, quoteTallSqftByBand, tallSqftByBand } from './ceilingHeights'
import { parseTakeoffFileV3 } from './quoteTakeoffImportV3'
import { mergeFieldTakeoff } from './fieldMeasurementUtils'
import type { FieldMeasurementArea, FieldTakeoff, QuoteLineItem } from '@/types/drywall'

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
  /** How Mark labels a Togal takeoff (2026-10-15): floors and tall rooms as areas, walls with their height, ceilings plain. */
  function houseFile(): File {
    const aoa = [
      ['Classification', 'Quantity 1', 'Quantity1 UOM', 'Quantity 2', 'Quantity2 UOM'],
      ['1st Floor', '', '', '', ''],
      ['9\' 1/2" Walls', 4000, 'SF', 0, ''],
      ['Ceiling', 1800, 'SF', 0, ''],
      ['Total', 5800, '', 0, ''],
      ['Great Room', '', '', '', ''],
      ['18\' 1/2" Walls', 1200, 'SF', 0, ''],
      ['Ceiling', 450, 'SF', 0, ''],
      ['Total', 1650, '', 0, ''],
      ['2nd Floor', '', '', '', ''],
      ['8\' 1/2" Walls', 3000, 'SF', 0, ''],
      ['Ceiling', 1500, 'SF', 0, ''],
      ['Total', 4500, '', 0, ''],
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Togal')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    return new File([buf], 'house.xlsx')
  }

  const heightsOf = (lines: QuoteLineItem[]) =>
    lines.filter((l) => l.type === 'drywall').map((l) => `${l.location} · ${l.description} · ${l.height_ft ?? '-'}`)

  it('an import reads wall heights from the labels, and ceilings take their area’s walls', async () => {
    const { lines } = await parseTakeoffFileV3(houseFile())
    expect(heightsOf(lines.map((l) => l.line))).toEqual([
      '1st Floor · 9\' 1/2" Walls · 9',
      '1st Floor · Ceiling · 9',
      'Great Room · 18\' 1/2" Walls · 18',
      'Great Room · Ceiling · 18',
      '2nd Floor · 8\' 1/2" Walls · 8',
      '2nd Floor · Ceiling · 8',
    ])
  })

  it('tall board is summed per band from the lines; lines with no height use the job default', async () => {
    const { lines } = await parseTakeoffFileV3(houseFile())
    const quote = { lineItems: lines.map((l) => l.line), default_height_ft: 9 }
    expect(quoteTallSqftByBand(quote)).toEqual({ '15+': 1650 })
    const typed = { ...quote, lineItems: [...quote.lineItems, { id: 'x', type: 'drywall', location: 'Garage', quantity: 900 } as QuoteLineItem] }
    expect(quoteTallSqftByBand({ ...typed, default_height_ft: 10 })).toEqual({ '10-11': 900, '15+': 1650 })
  })

  it('the quote’s areas, with their heights, can start the Field measurement', async () => {
    const { lines } = await parseTakeoffFileV3(houseFile())
    expect(quoteAreasForField({ lineItems: lines.map((l) => l.line), default_height_ft: 9 })).toEqual([
      { name: '1st Floor', heightFt: 9 },
      { name: 'Great Room', heightFt: 18 },
      { name: '2nd Floor', heightFt: 8 },
    ])
  })

  it('a line’s height and the quote default survive loading the quote', async () => {
    const { hydrateDrywallQuoteV3 } = await import('./createEmptyDrywallQuoteV3')
    const q = hydrateDrywallQuoteV3({
      version: 3,
      default_height_ft: 9,
      lineItems: [{ id: 'g', type: 'drywall', location: 'Great Room', quantity: 1200, height_ft: 18 }],
    })
    expect(q.default_height_ft).toBe(9)
    expect(q.lineItems[0].height_ft).toBe(18)
    const old = hydrateDrywallQuoteV3({ version: 3, lineItems: [{ id: 'o', type: 'drywall', quantity: 100 }] })
    expect('default_height_ft' in old).toBe(false)
    expect('height_ft' in old.lineItems[0]).toBe(false)
  })
})

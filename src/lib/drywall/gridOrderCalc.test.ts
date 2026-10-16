/**
 * The grid calculator (Mark, 2026-10-16): the quote's grid layout, tee spacing chosen per
 * calculation, hanger wire in 4' pieces and lags by the box — and its lines reaching the order.
 */
import { describe, expect, it } from 'vitest'
import { gridInputFromQuoteLines, gridOrderCounts } from './gridOrderCalc'
import { suggestOrderItemsFromFieldTakeoff } from './orderSuggest'
import { getDefaultUnit } from './fieldAccessoryUi'
import type { FieldTakeoff } from '@/types/drywall'

// Lisbon Opportunity Homes' quoted grid: 507 sqft, 288.13' perimeter, 10% waste.
const lisbon = { sqft: 507, perimeter: 288.13, wastePct: 10 }

describe('grid calculator', () => {
  it('sizes Lisbon’s grid — the quote’s mains and wall angle, tees at the spacing chosen', () => {
    expect(gridOrderCounts({ ...lisbon, teeSpacingIn: 24 })).toEqual({
      mains: 12, // 557.7 sqft ÷ (4' apart × 12')
      tees4ft: 70, // ÷ 8 sqft per tee — what the quote prices
      wallAngle: 40, // 316.9' ÷ 8'
      hangerWire: 36, // 3 hangers per 12' main
      lagBoxes: 1,
    })
    expect(gridOrderCounts({ ...lisbon, teeSpacingIn: 16 })?.tees4ft).toBe(105)
  })

  it('a missing perimeter is a square room’s, as on the quote', () => {
    expect(gridOrderCounts({ sqft: 400, wastePct: 0, teeSpacingIn: 24 })?.wallAngle).toBe(10) // 80' ÷ 8'
  })

  it('lags go by the box of 100', () => {
    expect(gridOrderCounts({ sqft: 1700, wastePct: 0, teeSpacingIn: 24 })).toMatchObject({ hangerWire: 108, lagBoxes: 2 })
  })

  it('nothing to size without sqft', () => {
    expect(gridOrderCounts({ sqft: 0, wastePct: 10, teeSpacingIn: 16 })).toBeNull()
  })

  it('starts from the quote’s grid lines, summed', () => {
    expect(
      gridInputFromQuoteLines([
        { type: 'drywall', quantity: 4905 },
        { type: 'suspended_grid', quantity: 507, grid_perimeter: 288.13, waste_pct: 10 },
        { type: 'suspended_grid', quantity: 93, grid_perimeter: 40, waste_pct: 5 },
      ]),
    ).toEqual({ sqft: 600, perimeter: 328.13, wastePct: 10 })
    expect(gridInputFromQuoteLines([{ type: 'drywall', quantity: 100 }])).toBeNull()
  })

  it('grid wire is by the piece and lags by the box; acoustic wire stays by the roll', () => {
    expect(getDefaultUnit('Suspended Drywall Grid', 'Hanger Wire')).toBe('pcs')
    expect(getDefaultUnit('Suspended Drywall Grid', 'Lags')).toBe('box')
    expect(getDefaultUnit('Acoustic Ceiling', 'Hanger Wire')).toBe('roll')
  })

  it('the lines it adds reach the order suggestion', () => {
    const takeoff = {
      measurements: [],
      photos: [],
      checklist: [],
      accessories: [
        { id: 'w', type: 'Suspended Drywall Grid', subtype: 'Hanger Wire', quantity: '36', unit: 'pcs', autoCalculated: false, phase: 4 },
        { id: 'l', type: 'Suspended Drywall Grid', subtype: 'Lags', quantity: '1', unit: 'box', autoCalculated: false, phase: 4 },
      ],
    } as unknown as FieldTakeoff
    const items = suggestOrderItemsFromFieldTakeoff(takeoff, []).items
    expect(items.map((i) => [i.quantity, i.unit])).toEqual([
      ['36', 'pcs'],
      ['1', 'box'],
    ])
    expect(items.every((i) => /Hanger Wire|Lags/.test(i.description))).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { createDefaultDrywallCatalogSeeds } from './catalogSeeds'
import { computeLineItem } from './quoteV3Math'
import { calcSuspendedGridTotals } from './calculations/suspendedGridCalc'
import { LABOR_TAX_RATE } from './calculations/quantityUtils'
import type { QuoteLineItem } from '@/types/drywall'
import type { SuspendedGridCatalogEntry } from '@/types/drywallCatalogs'

const RATES = { mains: 12, tees_4ft: 3, wire: 0.5, lags: 0.4, wall_angle: 8 }

function makeCatalogs() {
  const catalogs = createDefaultDrywallCatalogSeeds()
  const entry = (
    component_type: SuspendedGridCatalogEntry['component_type'],
    unit: 'each' | 'lf',
    material_rate: number,
  ): SuspendedGridCatalogEntry => ({
    id: component_type,
    display_name: component_type,
    component_type,
    unit,
    material_rate,
    labor_rate: 0,
  })
  catalogs.suspended_grid = [
    entry('mains', 'each', RATES.mains),
    entry('tees_4ft', 'each', RATES.tees_4ft),
    entry('wire', 'lf', RATES.wire),
    entry('lags', 'each', RATES.lags),
    entry('wall_angle', 'each', RATES.wall_angle),
  ]
  return catalogs
}

function gridLine(patch: Partial<QuoteLineItem>): QuoteLineItem {
  return {
    id: 'g1',
    type: 'suspended_grid',
    description: '',
    location: 'Ceiling A',
    quantity: 0,
    catalog_id: '',
    custom_labor_rate: 2,
    ...patch,
  }
}

function v2Material(sqft: number, perimeter: number, wastePct: number) {
  const v2 = calcSuspendedGridTotals({
    baseSqft: sqft,
    basePerimeter: perimeter,
    wastePct,
    carpenterRate: 2,
    shiny90Rate: RATES.wall_angle,
    mainsRate: RATES.mains,
    tees4ftRate: RATES.tees_4ft,
    wireRate: RATES.wire,
    lagsRate: RATES.lags,
    taxRatePct: 0,
    overheadPct: 0,
    profitPct: 0,
  })
  return v2.suspendedGridMaterialCost as number
}

describe('computeLineItem suspended_grid — itemized parity with v2', () => {
  it('material matches v2 suspendedGridMaterialCost (explicit perimeter, no waste)', () => {
    const catalogs = makeCatalogs()
    const line = gridLine({ quantity: 2400, grid_perimeter: 200, waste_pct: 0 })
    const computed = computeLineItem(line, catalogs)
    expect(computed.materialTotal).toBeCloseTo(v2Material(2400, 200, 0), 6)
    // sanity: 50*12 + 300*3 + 480*0.5 + 60*0.4 + 25*8 = 1964
    expect(computed.materialTotal).toBeCloseTo(1964, 6)
    expect(computed.gridBreakdown).toEqual({
      perimeter: 200,
      mains: 50,
      tees_4ft: 300,
      wire: 480,
      lags: 60,
      wall_angle: 25,
    })
  })

  it('matches v2 with 10% waste', () => {
    const catalogs = makeCatalogs()
    const line = gridLine({ quantity: 2400, grid_perimeter: 200, waste_pct: 10 })
    const computed = computeLineItem(line, catalogs)
    expect(computed.materialTotal).toBeCloseTo(v2Material(2400, 200, 10), 6)
  })

  it('derives perimeter as 4×√sqft when blank (matches v2 derivation)', () => {
    const catalogs = makeCatalogs()
    const line = gridLine({ quantity: 2400, waste_pct: 0 })
    const computed = computeLineItem(line, catalogs)
    // v2 also derives 4×√sqft when perimeter is 0
    expect(computed.materialTotal).toBeCloseTo(v2Material(2400, 0, 0), 6)
    expect(computed.gridBreakdown?.wall_angle).toBe(Math.ceil((4 * Math.sqrt(2400)) / 8))
  })

  it('honors per-component count overrides', () => {
    const catalogs = makeCatalogs()
    const line = gridLine({
      quantity: 1000,
      grid_count_overrides: { mains: 5, tees_4ft: 10, wire: 20, lags: 3, wall_angle: 8 },
    })
    const computed = computeLineItem(line, catalogs)
    const expected =
      5 * RATES.mains + 10 * RATES.tees_4ft + 20 * RATES.wire + 3 * RATES.lags + 8 * RATES.wall_angle
    expect(computed.materialTotal).toBeCloseTo(expected, 6)
  })

  it('blended fallback: custom_material_rate prices qty × rate (converted lines, no itemization)', () => {
    const catalogs = makeCatalogs()
    const line = gridLine({ quantity: 1000, custom_material_rate: 1.5 })
    const computed = computeLineItem(line, catalogs)
    expect(computed.materialTotal).toBeCloseTo(1500, 6)
    expect(computed.gridBreakdown).toBeUndefined()
  })

  it('labor = sqft × carpenter rate with default burden', () => {
    const catalogs = makeCatalogs()
    const line = gridLine({ quantity: 1000, custom_labor_rate: 2 })
    const computed = computeLineItem(line, catalogs)
    expect(computed.laborTotal).toBeCloseTo(1000 * 2 * (1 + LABOR_TAX_RATE), 6)
  })
})

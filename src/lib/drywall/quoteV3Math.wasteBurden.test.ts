import { describe, expect, it } from 'vitest'
import { createDefaultDrywallCatalogSeeds } from './catalogSeeds'
import { computeLineItem } from './quoteV3Math'
import { LABOR_TAX_RATE } from './calculations/quantityUtils'
import type { QuoteLineItem } from '@/types/drywall'
import type { SuspendedGridCatalogEntry } from '@/types/drywallCatalogs'

const BURDEN = 1 + LABOR_TAX_RATE

function line(patch: Partial<QuoteLineItem>): QuoteLineItem {
  return {
    id: 'l1',
    type: 'metal_stud',
    description: '',
    location: '',
    quantity: 0,
    catalog_id: '',
    ...patch,
  }
}

describe('waste + labor burden across generic component trades', () => {
  const catalogs = createDefaultDrywallCatalogSeeds()

  it('applies waste to material AND labor, plus burden (metal_stud @ 10%)', () => {
    const l = line({
      type: 'metal_stud',
      quantity: 100,
      custom_material_rate: 5,
      custom_labor_rate: 1.5,
      waste_pct: 10,
    })
    const c = computeLineItem(l, catalogs)
    expect(c.materialTotal).toBeCloseTo(100 * 5 * 1.1, 6)
    expect(c.laborTotal).toBeCloseTo(100 * 1.1 * 1.5 * BURDEN, 6)
  })

  it('no waste input → 0% (material and labor are un-multiplied) for insulation', () => {
    const l = line({
      type: 'insulation',
      quantity: 200,
      custom_material_rate: 0.8,
      custom_labor_rate: 0.4,
      // waste_pct omitted → components default to 0
    })
    const c = computeLineItem(l, catalogs)
    expect(c.materialTotal).toBeCloseTo(200 * 0.8, 6)
    expect(c.laborTotal).toBeCloseTo(200 * 0.4 * BURDEN, 6)
  })

  it('honors labor-burden opt-out on a component line', () => {
    const l = line({ type: 'frp', quantity: 50, custom_labor_rate: 2, waste_pct: 0 })
    const withBurden = computeLineItem(l, catalogs)
    const noBurden = computeLineItem(l, catalogs, { componentIncludeLaborBurden: false })
    expect(withBurden.laborTotal).toBeCloseTo(50 * 2 * BURDEN, 6)
    expect(noBurden.laborTotal).toBeCloseTo(50 * 2, 6)
  })
})

describe('suspended grid waste + shiny_90 fallback', () => {
  const RATES = { mains: 12, wall_angle: 8 }

  function gridCatalogs(angleType: 'wall_angle' | 'shiny_90') {
    const catalogs = createDefaultDrywallCatalogSeeds()
    const e = (
      component_type: SuspendedGridCatalogEntry['component_type'],
      material_rate: number,
    ): SuspendedGridCatalogEntry => ({
      id: component_type,
      display_name: component_type,
      component_type,
      unit: 'each',
      material_rate,
      labor_rate: 0,
    })
    catalogs.suspended_grid = [e('mains', RATES.mains), e(angleType, RATES.wall_angle)]
    return catalogs
  }

  function gridLine(patch: Partial<QuoteLineItem>): QuoteLineItem {
    return {
      id: 'g1',
      type: 'suspended_grid',
      description: '',
      location: '',
      quantity: 0,
      catalog_id: '',
      custom_labor_rate: 2,
      ...patch,
    }
  }

  it('uses the shiny_90 rate when the catalog has no wall_angle entry', () => {
    // 2400 sqft, perimeter 200: mains = 50, wall_angle = ceil(200/8) = 25.
    const l = gridLine({ quantity: 2400, grid_perimeter: 200, waste_pct: 0 })
    const withWallAngle = computeLineItem(l, gridCatalogs('wall_angle'))
    const withShiny90 = computeLineItem(l, gridCatalogs('shiny_90'))
    const expected = 50 * RATES.mains + 25 * RATES.wall_angle // 600 + 200 = 800
    expect(withWallAngle.materialTotal).toBeCloseTo(expected, 6)
    expect(withShiny90.materialTotal).toBeCloseTo(expected, 6)
  })

  it('grid labor scales with waste (sqftWasted × carpenter rate × burden)', () => {
    const l = gridLine({ quantity: 1000, waste_pct: 10, custom_labor_rate: 2 })
    const c = computeLineItem(l, gridCatalogs('shiny_90'))
    expect(c.laborTotal).toBeCloseTo(1000 * 1.1 * 2 * BURDEN, 6)
  })
})

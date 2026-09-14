/**
 * The metal-stud labor rate cell must show what the line is actually charged.
 *
 * The pricing engine resolves metal-stud labor by size + gauge. The rate cell
 * resolved it by `catalog_id`, which metal-stud lines do not carry — none of the
 * live ones do — so the cell and its tooltip read $0.00 while the line priced at
 * the catalogued rate. P1-MONEY-4.
 */
import { describe, expect, it } from 'vitest'
import { getEffectiveComponentLaborRate } from './quoteV3CatalogResolve'
import { computeLineItem } from './quoteV3Math'
import { createDefaultDrywallCatalogSeeds } from './catalogSeeds'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import type { QuoteLineItem } from '@/types/drywall'

function catalogsWithStud(laborRate: number): OrgDrywallCatalogs {
  const c = createDefaultDrywallCatalogSeeds()
  return {
    ...c,
    metal_stud: [
      {
        id: 'ms-1',
        display_name: '3-5/8" 20ga stud',
        component: 'stud',
        size: '3.625',
        gauge: '20',
        material_rate_per_lf: 1.5,
        labor_rate: laborRate,
      } as OrgDrywallCatalogs['metal_stud'][0],
    ],
  }
}

function studLine(patch: Partial<QuoteLineItem> = {}): QuoteLineItem {
  return {
    id: 'l1',
    type: 'metal_stud',
    location: 'Walls',
    quantity: 100,
    ms_size: '3.625',
    ms_gauge: '20',
    ...patch,
  } as QuoteLineItem
}

describe('metal-stud labor rate', () => {
  it('the displayed rate is non-zero when the catalog has one', () => {
    // This returned 0 before the fix: the line has no catalog_id to look up.
    expect(getEffectiveComponentLaborRate(studLine(), catalogsWithStud(12))).toBe(12)
  })

  it('agrees with what the engine charges', () => {
    const catalogs = catalogsWithStud(12)
    const line = studLine({ custom_material_rate: 5, waste_pct: 0 })
    const displayed = getEffectiveComponentLaborRate(line, catalogs)
    const computed = computeLineItem(line, catalogs, { componentIncludeLaborBurden: false })
    // Blended branch: labor = qty x waste x rate, and waste is 0 here.
    expect(computed.laborTotal).toBeCloseTo((line.quantity ?? 0) * displayed, 2)
  })

  it('still lets a per-line override win', () => {
    expect(getEffectiveComponentLaborRate(studLine({ custom_labor_rate: 20 }), catalogsWithStud(12))).toBe(20)
  })

  it('falls back to the engine defaults when size and gauge are unset', () => {
    const line = studLine({ ms_size: undefined, ms_gauge: undefined })
    // Engine defaults are 3.625 / 20, so the seeded entry must still match.
    expect(getEffectiveComponentLaborRate(line, catalogsWithStud(12))).toBe(12)
  })

  it('is 0 when the catalog genuinely has no matching stud', () => {
    const line = studLine({ ms_size: '6', ms_gauge: '18' })
    expect(getEffectiveComponentLaborRate(line, catalogsWithStud(12))).toBe(0)
  })
})

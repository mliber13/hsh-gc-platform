/**
 * P1-MONEY-5, decided Mark 2026-10-15: grid / acoustic / metal-stud lines price either itemised from
 * the catalog or at one rate — an explicit choice on the line, not a side effect of typing a rate.
 */
import { describe, expect, it } from 'vitest'
import { componentPricingMode, isBlendedComponentLine } from './quoteV3CatalogResolve'
import { computeLineItem } from './quoteV3Math'
import { hydrateDrywallQuoteV3 } from './createEmptyDrywallQuoteV3'
import { itemizedMaterialPerUnit } from '@/components/drywall/quote/v3/ComponentPricingModeField'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import type { QuoteLineItem } from '@/types/drywall'

const catalogs = {
  boards: [],
  finish_scopes: [],
  suspended_grid: [
    { id: 'm', component_type: 'mains', material_rate: 12 },
    { id: 't', component_type: 'tees_4ft', material_rate: 3 },
    { id: 'w', component_type: 'wire', material_rate: 0.5 },
    { id: 'l', component_type: 'lags', material_rate: 1 },
    { id: 'a', component_type: 'wall_angle', material_rate: 4 },
  ],
  acoustic: [],
  metal_stud: [],
  rc_channel: [],
  insulation: [],
  frp: [],
  door_install: [],
  accessories: [],
} as unknown as OrgDrywallCatalogs

const grid = (patch: Partial<QuoteLineItem> = {}): QuoteLineItem =>
  ({ id: 'g', type: 'suspended_grid', catalog_id: '', quantity: 1200, waste_pct: 0, ...patch }) as QuoteLineItem

describe('component pricing mode', () => {
  it('lines saved before the setting read as the engine always priced them — no price moves', () => {
    expect(componentPricingMode(grid())).toBe('itemized')
    expect(componentPricingMode(grid({ custom_material_rate: 1.4 }))).toBe('flat_rate')
    expect(computeLineItem(grid({ custom_material_rate: 1.4 }), catalogs).materialTotal).toBeCloseTo(1200 * 1.4, 6)
  })

  /** The P1-MONEY-5 bug: a typed rate silently switched the line. An explicit choice now wins. */
  it('an explicit itemised choice ignores a leftover typed rate', () => {
    const itemized = computeLineItem(grid(), catalogs).materialTotal
    const withStale = computeLineItem(grid({ pricing_mode: 'itemized', custom_material_rate: 1.4 }), catalogs).materialTotal
    expect(withStale).toBeCloseTo(itemized, 6)
    expect(isBlendedComponentLine(grid({ pricing_mode: 'itemized', custom_material_rate: 1.4 }))).toBe(false)
  })

  it('one rate with nothing entered yet prices material at zero, not itemised', () => {
    expect(computeLineItem(grid({ pricing_mode: 'flat_rate' }), catalogs).materialTotal).toBe(0)
    expect(isBlendedComponentLine(grid({ pricing_mode: 'flat_rate' }))).toBe(true)
  })

  it('switching to one rate starts at the itemised price, so the quote does not jump', () => {
    const itemized = computeLineItem(grid(), catalogs).materialTotal
    const rate = itemizedMaterialPerUnit(grid(), catalogs)
    const flat = computeLineItem(grid({ pricing_mode: 'flat_rate', custom_material_rate: rate }), catalogs).materialTotal
    expect(flat).toBeCloseTo(itemized, 0)
  })

  /** hydrateLineItem is a field-by-field allowlist — the kind that dropped hangOnly on 10-08. */
  it('the choice survives loading the quote', () => {
    const q = hydrateDrywallQuoteV3({ version: 3, lineItems: [grid({ pricing_mode: 'itemized', custom_material_rate: 1.4 })] })
    expect(q.lineItems[0].pricing_mode).toBe('itemized')
    expect(computeLineItem(q.lineItems[0], catalogs).materialTotal).toBeCloseTo(computeLineItem(grid(), catalogs).materialTotal, 6)
  })

  it('drywall and other trades are untouched', () => {
    expect(isBlendedComponentLine({ ...grid(), type: 'drywall', custom_material_rate: 0.6 } as QuoteLineItem)).toBe(false)
    expect(isBlendedComponentLine({ ...grid(), type: 'rc_channel', custom_material_rate: 0.6 } as QuoteLineItem)).toBe(true)
  })
})

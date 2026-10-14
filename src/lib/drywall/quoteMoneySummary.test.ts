import { describe, expect, it } from 'vitest'
import { computeQuoteV3Totals } from './quoteV3Math'
import { quoteCostBreakdown, quoteMoneySummary, splitLaborBurden } from './quoteMoneySummary'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import type { DrywallQuoteV3, QuoteLineItem } from '@/types/drywall'

const catalogs = {
  boards: [{ id: 'b1', display_name: '5/8" Type X', material_rate: 0.5, hanger_rate: 0.3, default_waste_pct: 10 }],
  finish_scopes: [{ id: 'level_4', display_name: 'Level 4', finisher_rate: 0.32, accessories_applied: {}, payroll_piece_key: 'level_4', applies_to_locations: [] }],
  door_install: [], insulation: [{ id: 'i1', display_name: 'R13', labor_rate: 0.4, material_rate_per_sqft: 0.5, unit: 'sqft' }],
  frp: [], rc_channel: [], suspended_grid: [], acoustic: [], metal_stud: [], accessories: [],
  marginFloorTarget: 0.3,
} as unknown as OrgDrywallCatalogs

const quote = (over: Partial<DrywallQuoteV3> = {}) =>
  ({
    version: 3,
    lineItems: [
      { id: 'd', type: 'drywall', catalog_id: 'b1', finish_scope_id: 'level_4', quantity: 2000, waste_pct: 10 },
      { id: 'i', type: 'insulation', catalog_id: 'i1', quantity: 1000, waste_pct: 10 },
    ] as QuoteLineItem[],
    alternates: [],
    prep_clean_rate: 0.03,
    overhead_pct: 10,
    profit_pct: 10,
    sales_tax_pct: 0,
    ...over,
  }) as unknown as DrywallQuoteV3

describe('quote money summary', () => {
  it('splits burden back out exactly, and leaves unburdened labour alone', () => {
    expect(splitLaborBurden(125, true)).toEqual({ wages: 100, burden: 25 })
    expect(splitLaborBurden(125, false)).toEqual({ wages: 125, burden: 0 })
  })

  /** Wages + one burden line must add back to what the engine priced — nothing re-priced. */
  it('trade wages + cleanup + the single burden line reproduce the engine subtotal', () => {
    for (const toggles of [{}, { hanger_include_labor_burden: false, prep_clean_include_labor_burden: false }]) {
      const q = quote(toggles as Partial<DrywallQuoteV3>)
      const totals = computeQuoteV3Totals(q, catalogs)
      const b = quoteCostBreakdown(q, totals)
      const rebuilt = b.trades.reduce((s, t) => s + t.subtotal, 0) + b.cleanupWages + b.laborBurden
      expect(rebuilt).toBeCloseTo(totals.routine.linesSubtotal + totals.routine.cleanupTotal, 6)
    }
  })

  it('finisher labour shows as wages — 2,200 sqft × $0.32, burden elsewhere', () => {
    const q = quote()
    const b = quoteCostBreakdown(q, computeQuoteV3Totals(q, catalogs))
    expect(b.trades.find((t) => t.type === 'drywall')?.finisherWages).toBeCloseTo(2200 * 0.32, 6)
    expect(b.laborBurden).toBeGreaterThan(0)
  })

  it('margin is measured the way the send gate measures it', () => {
    const q = quote()
    const totals = computeQuoteV3Totals(q, catalogs)
    const s = quoteMoneySummary(totals, 0.3)
    expect(s.total).toBe(totals.routine.total)
    expect(s.marginPct).toBeCloseTo((totals.acceptedTotal - s.cost) / totals.acceptedTotal, 6)
    expect(s.contractTotal).toBeNull()
  })
})

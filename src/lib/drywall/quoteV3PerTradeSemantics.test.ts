import { describe, expect, it } from 'vitest'
import { computeLineItem, computeQuoteV3Totals } from './quoteV3Math'
import { computeQuoteEstimatedCost } from './marginFloor'
import { laborAmountTooltip } from './quoteV3LineAmountTooltips'
import { getEffectiveComponentLaborRate } from './quoteV3CatalogResolve'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import type { QuoteLineItem } from '@/types/drywall'

/** Enough catalog to price one line of each component trade. */
const catalogs = {
  boards: [{ id: 'b1', display_name: '5/8" Type X', material_rate: 0.5, hanger_rate: 0, default_waste_pct: 10 }],
  finish_scopes: [{ id: 'level_4', display_name: 'Level 4', finisher_rate: 0.32, accessories_applied: {}, payroll_piece_key: 'level_4', applies_to_locations: [] }],
  door_install: [{ id: 'd1', display_name: 'Door', labor_rate: 260, material_rate: 0, unit: 'each' }],
  insulation: [{ id: 'i1', display_name: 'R13', labor_rate: 0.4, material_rate_per_sqft: 0.5, unit: 'sqft' }],
  frp: [{ id: 'f1', display_name: 'FRP', labor_rate: 1.2, material_rate: 2, unit: 'sqft' }],
  rc_channel: [],
  suspended_grid: [],
  acoustic: [],
  metal_stud: [],
  accessories: [],
} as unknown as OrgDrywallCatalogs

const line = (over: Partial<QuoteLineItem>): QuoteLineItem =>
  ({ id: 'l1', type: 'door_install', catalog_id: 'd1', quantity: 9, waste_pct: 10, ...over }) as QuoteLineItem

// T5 — component labor rate resolution, and the tooltip reproducing the real total.
describe('T5 — component labor', () => {
  it('prices doors on the count, never on the waste (Mark, 2026-09-29)', () => {
    // 9 doors × $260 × 1.25 burden. The 10% waste belongs to material only; paying it on
    // labour was 0.9 of a door nobody hangs — $292.50 on Lisbon.
    const computed = computeLineItem(line({}), catalogs)
    expect(computed.laborTotal).toBeCloseTo(9 * 260 * 1.25, 2)
  })

  it('keeps waste on labour for insulation and FRP, where the offcut is real work', () => {
    const ins = computeLineItem(line({ type: 'insulation', catalog_id: 'i1', quantity: 1000 }), catalogs)
    expect(ins.laborTotal).toBeCloseTo(1000 * 1.1 * 0.4 * 1.25, 2)

    const frp = computeLineItem(line({ type: 'frp', catalog_id: 'f1', quantity: 500 }), catalogs)
    expect(frp.laborTotal).toBeCloseTo(500 * 1.1 * 1.2 * 1.25, 2)
  })

  it('shows arithmetic that reaches the total it is printed beside', () => {
    // The tooltip used to read "qty × rate = total" while the engine also applied waste and
    // burden, so the numbers on screen could not be multiplied to get the number next to
    // them. That is the moment someone stops trusting the quote.
    for (const l of [
      line({}),
      line({ type: 'insulation', catalog_id: 'i1', quantity: 1000 }),
      line({ type: 'frp', catalog_id: 'f1', quantity: 500 }),
    ]) {
      const computed = computeLineItem(l, catalogs)
      const tip = laborAmountTooltip(l, catalogs, computed)
      expect(tip).toContain('labor burden')
      // The rate it names is the one the engine used.
      expect(tip).toContain(String(getEffectiveComponentLaborRate(l, catalogs)))
    }
  })

  it('names waste in the tooltip only where waste applies', () => {
    const doors = line({})
    expect(laborAmountTooltip(doors, catalogs, computeLineItem(doors, catalogs))).not.toContain('waste')

    const ins = line({ type: 'insulation', catalog_id: 'i1', quantity: 1000 })
    expect(laborAmountTooltip(ins, catalogs, computeLineItem(ins, catalogs))).toContain('waste')
  })
})

// T3 — alternates netting.
describe('T3 — alternates', () => {
  const baseQuote = (alternates: unknown[]) =>
    ({
      version: 3,
      lineItems: [
        { id: 'd', type: 'drywall', catalog_id: 'b1', finish_scope_id: 'level_4', quantity: 2000, waste_pct: 10 },
      ],
      alternates,
      overhead_pct: 10,
      profit_pct: 30,
      sales_tax_pct: 6.75,
      prep_clean_rate: 0.03,
      project_hanger_rate: 0.28,
      project_finisher_rate: 0.45,
    }) as never

  it('carries cleanup on an alternate in proportion to its own drywall', () => {
    const withAlt = computeQuoteV3Totals(
      baseQuote([
        {
          id: 'a1',
          name: 'Add 1,000 sqft',
          selected: true,
          lineItems: [
            { id: 'ad', type: 'drywall', catalog_id: 'b1', finish_scope_id: 'level_4', quantity: 1000, waste_pct: 10 },
          ],
        },
      ]),
      catalogs,
    )
    // Adding drywall as an alternate has to price prep and clean for it. Passing 0 meant a
    // 1,000 sqft addition came with no cleanup labour at all.
    expect(withAlt.alternates[0].breakdown.cleanupTotal).toBeGreaterThan(0)
  })

  it('nets a selected deduct out of acceptedTotal and acceptedSqft', () => {
    const totals = computeQuoteV3Totals(
      baseQuote([
        {
          id: 'a2',
          name: 'Deduct the basement',
          selected: true,
          pricingMode: 'deduct',
          lineItems: [
            { id: 'dd', type: 'drywall', catalog_id: 'b1', finish_scope_id: 'level_4', quantity: 1000, waste_pct: 10 },
          ],
        },
      ]),
      catalogs,
    )
    expect(totals.acceptedTotal).toBeLessThan(totals.routine.total)
    expect(totals.acceptedSqft).toBe(1000)
  })
})

// T2 — one cost basis for the margin floor.
describe('T2 — margin floor cost basis', () => {
  it('counts sales tax as cost, and says so in one place', () => {
    // The v3 stage added tax inline while the helper left it out, so the gate's answer
    // depended on which surface asked it.
    expect(computeQuoteEstimatedCost(8000, 500, 250)).toBe(8750)
  })

  it('still answers the old way when a caller has no tax to account for', () => {
    expect(computeQuoteEstimatedCost(8000, 500)).toBe(8500)
  })
})

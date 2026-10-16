/**
 * Tall-wall pricing (Mark, 2026-10-16): from 10' up, mud and tape scale ×1.10 / ×1.20 / ×1.30
 * and tall-wall labor adds 3¢ / 6¢ / 12¢ per sqft of tall board — on the quote and the Field
 * order alike. A quote with nothing tall must price exactly as it did.
 */
import { describe, expect, it } from 'vitest'
import { createDefaultDrywallCatalogSeeds } from './catalogSeeds'
import { createEmptyDrywallQuoteV3, createQuoteLineItem, hydrateDrywallQuoteV3 } from './createEmptyDrywallQuoteV3'
import { computeLineItem, computeQuoteV3Totals } from './quoteV3Math'
import { quoteCostBreakdown } from './quoteMoneySummary'
import { calculateFieldAccessories } from './accessoryCalc'
import { tallFieldMudTapeExtraSqft, tallWallLaborWages } from './tallWallPricing'
import type { DrywallQuoteV3, FieldMeasurementArea, QuoteLineItem } from '@/types/drywall'

const catalogs = createDefaultDrywallCatalogSeeds()
const board = catalogs.boards[0]!.id
const finish = catalogs.finish_scopes.find((f) => f.id !== 'hang_only')!.id

const line = (patch: Partial<QuoteLineItem> = {}): QuoteLineItem => ({
  ...createQuoteLineItem('drywall', { location: 'Main' }),
  catalog_id: board,
  finish_scope_id: finish,
  quantity: 4000,
  ...patch,
})

const quoteOf = (lines: QuoteLineItem[], patch: Partial<DrywallQuoteV3> = {}): DrywallQuoteV3 => ({
  ...createEmptyDrywallQuoteV3(),
  project_hanger_rate: 0.3,
  project_finisher_rate: 0.35,
  lineItems: lines,
  ...patch,
})

const units = (l: QuoteLineItem, category: 'joint_compound' | 'tape') =>
  computeLineItem(l, catalogs).accessories.items.filter((i) => i.category === category).reduce((s, i) => s + i.units, 0)

describe('tall-wall pricing', () => {
  it('a quote with nothing 10’ and up prices exactly as before', () => {
    const plain = quoteOf([line()])
    const withHeights = quoteOf([line({ height_ft: 9 })], { default_height_ft: 9 })
    expect(computeQuoteV3Totals(withHeights, catalogs).routine.total).toBeCloseTo(
      computeQuoteV3Totals(plain, catalogs).routine.total,
      6,
    )
    expect(computeQuoteV3Totals(plain, catalogs).routine.tallWallLaborSubtotal).toBe(0)
  })

  it('tall board takes more mud and tape — about 30% more at 15’ and up', () => {
    const standard = line({ height_ft: 9 })
    const tall = line({ height_ft: 18 })
    expect(units(tall, 'joint_compound')).toBeGreaterThan(units(standard, 'joint_compound'))
    expect(units(tall, 'tape')).toBeGreaterThan(units(standard, 'tape'))
    expect(units(tall, 'joint_compound') / units(standard, 'joint_compound')).toBeGreaterThan(1.2)
  })

  it('a line with no height of its own uses the job default', () => {
    const q = quoteOf([line()], { default_height_ft: 12 })
    const standard = computeQuoteV3Totals(quoteOf([line()]), catalogs).routine.accessoriesSubtotal
    expect(computeQuoteV3Totals(q, catalogs).routine.accessoriesSubtotal).toBeGreaterThan(standard)
  })

  it('tall-wall labor: tall sqft × the band rate, burdened like finishing, in cost and price', () => {
    const q = quoteOf([line({ height_ft: 18, quantity: 1000 }), line({ id: 'w', height_ft: 9, quantity: 3000 })])
    expect(tallWallLaborWages(q)).toBeCloseTo(1000 * 0.12, 6)
    const t = computeQuoteV3Totals(q, catalogs)
    expect(t.routine.tallWallLaborSubtotal).toBeCloseTo(1000 * 0.12 * 1.25, 6)

    // It is in the cost the margin floor reads (linesSubtotal) and in the price.
    const without = computeQuoteV3Totals({ ...q, tall_wall_labor_rates: { '15+': 0 } }, catalogs)
    expect(t.routine.linesSubtotal - without.routine.linesSubtotal).toBeCloseTo(150, 6)
    expect(t.routine.total).toBeGreaterThan(without.routine.total)

    // The breakdown shows wages on their own line and the burden in the one burden line.
    const b = quoteCostBreakdown(q, t)
    expect(b.tallWallWages).toBeCloseTo(120, 6)
  })

  it('a quote can set its own rate per band, and keeps it through loading', () => {
    const q = quoteOf([line({ height_ft: 18, quantity: 1000 })], { tall_wall_labor_rates: { '15+': 0.2 } })
    expect(tallWallLaborWages(q)).toBeCloseTo(200, 6)
    const loaded = hydrateDrywallQuoteV3({ ...q, version: 3 })
    expect(loaded.tall_wall_labor_rates).toEqual({ '15+': 0.2 })
    expect('tall_wall_labor_rates' in hydrateDrywallQuoteV3({ version: 3 })).toBe(false)
  })

  it('the Field order sizes mud and tape up for tall areas by the same factors', () => {
    const sheet = (n: number) => [{ id: `b${n}`, boardType: 'Drywall', thickness: '1/2', width: '48', length: '12', quantity: String(n) }]
    const areas: FieldMeasurementArea[] = [
      { id: 'a', area: '1st floor', heightFt: 9, boards: sheet(100) },
      { id: 'b', area: 'Great room', heightFt: 18, boards: sheet(25) },
    ]
    const extra = tallFieldMudTapeExtraSqft(areas)
    expect(extra).toBeCloseTo(1200 * 0.3, 6)
    const sqft = 6000
    const allPurpose = (x: number) =>
      Number(calculateFieldAccessories(sqft, 0, {}, sqft, 0, x).find((a) => a.subtype === 'All Purpose Joint Compound')!.quantity)
    expect(allPurpose(extra)).toBeGreaterThan(allPurpose(0))
  })
})

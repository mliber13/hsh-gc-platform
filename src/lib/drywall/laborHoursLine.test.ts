/**
 * Labor by the hour (Mark, 2026-10-16): patch and service work priced as hours × a rate set on
 * the line — no sqft, no material, burden and markup as other labor, duration hours ÷ 8, and
 * nothing on the customer PDF but its share of the total. Kirtland - Kosem needed 100 fake sqft
 * before this existed.
 */
import { describe, expect, it } from 'vitest'
import { createDefaultDrywallCatalogSeeds } from './catalogSeeds'
import { createEmptyDrywallQuoteV3, createQuoteLineItem } from './createEmptyDrywallQuoteV3'
import { computeLineItem, computeQuoteV3Totals } from './quoteV3Math'
import { quoteCostBreakdown } from './quoteMoneySummary'
import { computeDrywallDurationSummary } from './durationService'
import { buildQuoteV3PdfLineRows, foldHourlyLaborIntoRows } from './quoteV3PdfModel'
import { computeEstimatedLabor } from './estimatedLabor'
import type { DrywallQuoteV3, QuoteLineItem } from '@/types/drywall'

const catalogs = createDefaultDrywallCatalogSeeds()

const hourly = (hours: number, rate: number): QuoteLineItem => ({
  ...createQuoteLineItem('labor_hours', { location: 'Ceiling patches' }),
  quantity: hours,
  custom_labor_rate: rate,
  description: 'Ceiling patches',
})

const drywall = (sqft: number): QuoteLineItem => ({
  ...createQuoteLineItem('drywall', { location: 'Main' }),
  catalog_id: catalogs.boards[0]!.id,
  finish_scope_id: catalogs.finish_scopes.find((f) => f.id !== 'hang_only')!.id,
  quantity: sqft,
})

const quoteOf = (lines: QuoteLineItem[]): DrywallQuoteV3 => ({
  ...createEmptyDrywallQuoteV3(),
  project_hanger_rate: 0.3,
  project_finisher_rate: 0.35,
  overhead_pct: 10,
  profit_pct: 30,
  sales_tax_pct: 0,
  lineItems: lines,
})

describe('labor by the hour', () => {
  it('prices hours × the line’s rate, burdened like other labor — no material, no waste', () => {
    const c = computeLineItem(hourly(8, 28), catalogs)
    expect(c.materialTotal).toBe(0)
    expect(c.accessoriesTotal).toBe(0)
    expect(c.laborTotal).toBeCloseTo(8 * 28 * 1.25, 6)
    expect(c.unit).toBe('hr')
  })

  it('carries overhead and profit, adds no sqft, and shows as its own row in the breakdown', () => {
    const q = quoteOf([hourly(8, 28)])
    const t = computeQuoteV3Totals(q, catalogs)
    expect(t.totalSqft).toBe(0)
    expect(t.routine.total).toBeCloseTo(8 * 28 * 1.25 * 1.1 * 1.3, 4)
    const row = quoteCostBreakdown(q, t).trades.find((r) => r.type === 'labor_hours')
    expect(row?.componentWages).toBeCloseTo(8 * 28, 6)
  })

  it('counts in the estimated labor that Financials sets against payroll', () => {
    const est = computeEstimatedLabor(quoteOf([hourly(8, 28)]), catalogs)
    expect(est.componentsTotal).toBeCloseTo(8 * 28 * 1.25, 4)
  })

  it('duration: an hourly-only quote is its hours ÷ 8 days, nothing else', () => {
    const s = computeDrywallDurationSummary({ drywallSqft: 0, laborHours: 12 })
    expect(s.lines.map((l) => [l.key, l.days])).toEqual([['labor', 2]])
    expect(s.totalDays).toBe(2)
  })

  it('duration: with drywall too, the hourly days add a step and the drywall steps stay', () => {
    const plain = computeDrywallDurationSummary({ drywallSqft: 4000 })
    const both = computeDrywallDurationSummary({ drywallSqft: 4000, laborHours: 8 })
    expect(both.totalDays).toBe(plain.totalDays + 1)
    expect(computeDrywallDurationSummary({ drywallSqft: 4000, laborHours: 0 }).lines).toEqual(plain.lines)
  })

  it('customer PDF: no hourly row, and the rows that show still add up to the total', () => {
    const q = quoteOf([drywall(4000), hourly(8, 28)])
    const rows = buildQuoteV3PdfLineRows(q, catalogs)
    expect(rows.some((r) => r.trade === 'labor_hours')).toBe(false)
    const total = computeQuoteV3Totals(q, catalogs).routine.total
    expect(rows.reduce((s, r) => s + r.sellTotal, 0)).toBeCloseTo(total, 4)
  })

  it('customer PDF: an hourly-only quote shows no rows — just its total', () => {
    expect(buildQuoteV3PdfLineRows(quoteOf([hourly(8, 28)]), catalogs)).toEqual([])
    expect(foldHourlyLaborIntoRows([])).toEqual([])
  })
})

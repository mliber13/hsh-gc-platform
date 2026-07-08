import { describe, expect, it } from 'vitest'
import {
  groupPdfRowsByLocationForDisplay,
  buildQuoteV3PdfAlternateBlocks,
  buildQuoteV3PdfLineRows,
  type QuoteV3PdfLineRow,
} from './quoteV3PdfModel'
import { computeQuoteV3Totals } from './quoteV3Math'
import { createEmptyDrywallQuoteV3 } from './createEmptyDrywallQuoteV3'
import { createDefaultDrywallCatalogSeeds } from './catalogSeeds'
import type { QuoteLineItem } from '@/types/drywall'

function row(
  location: string,
  sellTotal: number,
  overrides: Partial<QuoteV3PdfLineRow> = {},
): QuoteV3PdfLineRow {
  return {
    line: { type: 'drywall' } as QuoteLineItem,
    location,
    sellTotal,
    trade: 'drywall',
    ...overrides,
  }
}

describe('groupPdfRowsByLocationForDisplay', () => {
  it('returns a single row unchanged', () => {
    const rows = [row('2nd Floor', 1000)]
    expect(groupPdfRowsByLocationForDisplay(rows)).toEqual(rows)
  })

  it('collapses multiple lines at the same location into one total', () => {
    const result = groupPdfRowsByLocationForDisplay([
      row('2nd Floor', 1000),
      row('2nd Floor', 2500),
      row(' 2nd floor ', 500),
    ])
    expect(result).toHaveLength(1)
    expect(result[0].location).toBe('2nd Floor')
    expect(result[0].sellTotal).toBe(4000)
  })

  it('groups by location when multiple distinct locations are present', () => {
    const result = groupPdfRowsByLocationForDisplay([
      row('2nd Floor', 1000),
      row('1st Floor', 800),
      row('2nd Floor', 200),
      row('Basement', 300),
    ])
    expect(result).toEqual([
      row('2nd Floor', 1200),
      row('1st Floor', 800),
      row('Basement', 300),
    ])
  })

  it('treats blank locations as one location and collapses', () => {
    const result = groupPdfRowsByLocationForDisplay([
      row('', 100),
      row('  ', 200),
      row('—', 50),
    ])
    expect(result).toHaveLength(1)
    expect(result[0].sellTotal).toBe(350)
  })
})

describe('buildQuoteV3PdfAlternateBlocks', () => {
  it('allocates sell totals per line for alternates with line items', () => {
    const catalogs = createDefaultDrywallCatalogSeeds()
    const quote = createEmptyDrywallQuoteV3()
    quote.overhead_pct = 10
    quote.profit_pct = 20
    quote.sales_tax_pct = 7
    quote.alternates = [
      {
        id: 'a1',
        name: 'Penthouse',
        description: 'Optional ceiling',
        lineItems: [
          {
            id: 'l1',
            type: 'drywall',
            description: 'Level 5 ceiling',
            location: 'Penthouse',
            quantity: 500,
            catalog_id: '1_2_type_x',
            finish_scope_id: 'level_4',
            custom_material_rate: 0.5,
            custom_hanger_rate: 0.2,
            custom_finisher_rate: 0.3,
            waste_pct: 10,
          },
          {
            id: 'l2',
            type: 'drywall',
            description: 'Level 5 walls',
            location: 'Main',
            quantity: 300,
            catalog_id: '1_2_type_x',
            finish_scope_id: 'level_4',
            custom_material_rate: 0.5,
            custom_hanger_rate: 0.2,
            custom_finisher_rate: 0.3,
            waste_pct: 10,
          },
        ],
      },
    ]
    const totals = computeQuoteV3Totals(quote, catalogs)
    const blocks = buildQuoteV3PdfAlternateBlocks(quote, catalogs, totals)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].rows).toHaveLength(2)
    expect(blocks[0].rows.every((r) => r.sellTotal > 0)).toBe(true)
    const rowSum = blocks[0].rows.reduce((s, r) => s + r.sellTotal, 0)
    expect(rowSum).toBeCloseTo(blocks[0].totalAdd, 2)
    const display = groupPdfRowsByLocationForDisplay(blocks[0].rows)
    expect(display).toHaveLength(2)
    expect(display.every((r) => r.sellTotal > 0)).toBe(true)
  })

  it('allocates sell totals when labor comes from project rates only', () => {
    const catalogs = createDefaultDrywallCatalogSeeds()
    const quote = createEmptyDrywallQuoteV3()
    quote.overhead_pct = 10
    quote.profit_pct = 20
    quote.sales_tax_pct = 7
    quote.project_hanger_rate = 0.2
    quote.project_finisher_rate = 0.3
    quote.alternates = [
      {
        id: 'a1',
        name: 'Penthouse',
        description: 'Optional ceiling',
        lineItems: [
          {
            id: 'l1',
            type: 'drywall',
            description: 'Level 5 ceiling',
            location: 'Penthouse',
            quantity: 500,
            catalog_id: '1_2_type_x',
            finish_scope_id: 'level_4',
            custom_material_rate: 0.5,
            waste_pct: 10,
          },
          {
            id: 'l2',
            type: 'drywall',
            description: 'Level 5 walls',
            location: 'Main',
            quantity: 300,
            catalog_id: '1_2_type_x',
            finish_scope_id: 'level_4',
            custom_material_rate: 0.5,
            waste_pct: 10,
          },
        ],
      },
    ]
    const totals = computeQuoteV3Totals(quote, catalogs)
    const blocks = buildQuoteV3PdfAlternateBlocks(quote, catalogs, totals)
    expect(blocks[0].totalAdd).toBeGreaterThan(0)
    expect(blocks[0].rows.every((r) => r.sellTotal > 0)).toBe(true)
    const rowSum = blocks[0].rows.reduce((s, r) => s + r.sellTotal, 0)
    expect(rowSum).toBeCloseTo(blocks[0].totalAdd, 2)
  })
})

describe('buildQuoteV3PdfLineRows tax allocation', () => {
  function quoteWithDrywallAndRc() {
    const catalogs = createDefaultDrywallCatalogSeeds()
    catalogs.rc_channel = [
      {
        id: 'rc-1',
        display_name: 'RC 12ft',
        size: '1-1/2',
        material_rate_per_piece: 10,
        labor_rate: 2,
        default_piece_length_ft: 12,
      },
    ]
    const quote = createEmptyDrywallQuoteV3()
    quote.overhead_pct = 10
    quote.profit_pct = 20
    quote.sales_tax_pct = 7
    quote.project_hanger_rate = 0.2
    quote.project_finisher_rate = 0.3
    quote.lineItems = [
      {
        id: 'dw-1',
        type: 'drywall',
        description: 'Walls',
        location: 'Main',
        quantity: 1000,
        catalog_id: '1_2_type_x',
        finish_scope_id: 'level_4',
        custom_material_rate: 0.5,
        waste_pct: 10,
      },
      {
        id: 'rc-1',
        type: 'rc_channel',
        description: 'RC ceiling',
        location: 'Main',
        quantity: 500,
        catalog_id: 'rc-1',
        rc_surface: 'ceiling',
        rc_spacing_in: 24,
      },
    ]
    return { catalogs, quote }
  }

  it('with taxShownSeparately=true, line sellTotals sum to pre-tax subtotal', () => {
    const { catalogs, quote } = quoteWithDrywallAndRc()
    const routine = computeQuoteV3Totals(quote, catalogs).routine
    const preTax = routine.total - routine.salesTaxAmount
    expect(routine.salesTaxAmount).toBeGreaterThan(0)

    const rows = buildQuoteV3PdfLineRows(quote, catalogs, true)
    const sum = rows.reduce((s, r) => s + r.sellTotal, 0)
    expect(sum).toBeCloseTo(preTax, 2)
    expect(preTax + routine.salesTaxAmount).toBeCloseTo(routine.total, 2)
  })

  it('with taxShownSeparately=false, line sellTotals sum to grand total', () => {
    const { catalogs, quote } = quoteWithDrywallAndRc()
    const routine = computeQuoteV3Totals(quote, catalogs).routine

    const rows = buildQuoteV3PdfLineRows(quote, catalogs, false)
    const sum = rows.reduce((s, r) => s + r.sellTotal, 0)
    expect(sum).toBeCloseTo(routine.total, 2)
  })
})

import { describe, expect, it } from 'vitest'
import { createDefaultDrywallCatalogSeeds } from './catalogSeeds'
import { createEmptyDrywallQuote } from './createEmptyDrywallQuote'
import { createEmptyDrywallQuoteV3, createQuoteLineItem } from './createEmptyDrywallQuoteV3'
import {
  buildOrderFinancialComparison,
  type OrderReviewLaborRatesInput,
} from './orderFinancialComparison'
import { projectV3QuoteToV2Shape } from './projectV3QuoteToV2Shape'
import { computeQuoteV3Totals } from './quoteV3Math'
import type { DrywallQuoteV3, FieldTakeoff, QuoteLineItem } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

function cents(n: number): number {
  return Math.round(n * 100) / 100
}

function emptyTakeoff(measuredSqft: number): FieldTakeoff {
  return {
    measurements: [],
    photos: [],
    accessories: [],
    checklist: [],
    totalMeasuredSqft: measuredSqft,
  }
}

function emptyRates(quote: {
  hangerRate?: string | number
  finisherRate?: string | number
  prepCleanRate?: string | number
}): OrderReviewLaborRatesInput {
  return {
    hangerRate: String(quote.hangerRate ?? ''),
    finisherRate: String(quote.finisherRate ?? ''),
    prepCleanRate: String(quote.prepCleanRate ?? ''),
  }
}

function line(type: QuoteLineItem['type'], patch: Partial<QuoteLineItem>): QuoteLineItem {
  return { ...createQuoteLineItem(type), ...patch, type }
}

/** Moreland Hills - Stearns: one soffit line with custom_hanger_rate 10, project hanger 1. */
function stearnsQuote(): DrywallQuoteV3 {
  const quote = createEmptyDrywallQuoteV3()
  quote.overhead_pct = 10
  quote.profit_pct = 30.5
  quote.sales_tax_pct = 7.015
  quote.prep_clean_rate = 0.2
  quote.project_hanger_rate = 1
  quote.project_finisher_rate = 1.32
  quote.hanger_include_labor_burden = true
  quote.finisher_include_labor_burden = true
  quote.prep_clean_include_labor_burden = true
  quote.lineItems = [
    line('drywall', {
      id: 'stearns-soffit',
      description: 'Soffit',
      location: 'Soffit',
      quantity: 35.7,
      catalog_id: '1_2_regular',
      finish_scope_id: 'level_4',
      custom_hanger_rate: 10,
      waste_pct: 10,
    }),
  ]
  return quote
}

function catalogsForStearns(): OrgDrywallCatalogs {
  const catalogs = createDefaultDrywallCatalogSeeds()
  const board = catalogs.boards.find((b) => b.id === '1_2_regular')
  if (board) board.material_rate = 0.39
  return catalogs
}

describe('buildOrderFinancialComparison §9 per-line override', () => {
  it('Stearns: original labour ≈ $565 and material from the quote, not flattened $1 rates', () => {
    const catalogs = catalogsForStearns()
    const v3 = stearnsQuote()
    const totals = computeQuoteV3Totals(v3, catalogs)
    const expectedLabor = cents(
      totals.routine.hangerLaborSubtotal +
        totals.routine.finisherLaborSubtotal +
        totals.routine.componentLaborSubtotal +
        totals.routine.cleanupTotal,
    )
    const expectedMaterial = cents(
      totals.routine.materialSubtotal +
        totals.routine.accessoriesSubtotal +
        totals.routine.salesTaxAmount,
    )

    // Engine labour is 35.7×1.1 × (10 + 1.32 + 0.2) × 1.25 = 565.49
    expect(expectedLabor).toBeCloseTo(565.49, 0)

    const flattened = projectV3QuoteToV2Shape(v3, catalogs)
    const takeoff = emptyTakeoff(144)
    const fin = buildOrderFinancialComparison(
      flattened,
      takeoff,
      [],
      emptyRates(flattened),
      { v3Quote: v3, catalogs },
    )

    expect(cents(fin.baselineLaborWithTax)).toBe(expectedLabor)
    expect(cents(fin.originalMaterialCost)).toBe(expectedMaterial)
    expect(fin.baselineLaborWithTax).toBeGreaterThan(500)
    // The flattened $1 path produced ~$122.85 labour and ~$573 material.
    expect(fin.baselineLaborWithTax).not.toBeCloseTo(122.85, 0)
    expect(fin.originalMaterialCost).not.toBeCloseTo(573.07, 0)
    // Unrounded 35.7 × 1.1 = 39.27, not Math.round → 39.
    expect(fin.originalSqft).toBeCloseTo(39.27, 2)
    expect(fin.revisedMaterialCost).toBe(
      fin.originalMaterialCost * (144 / fin.originalSqft),
    )
    expect(fin.revisedMaterialCost).not.toBeCloseTo(2115.95, 0)
  })

  it('a quote with no line override is unchanged versus the engine totals', () => {
    const catalogs = createDefaultDrywallCatalogSeeds()
    const v3 = createEmptyDrywallQuoteV3()
    v3.overhead_pct = 10
    v3.profit_pct = 30
    v3.sales_tax_pct = 7.25
    v3.prep_clean_rate = 0.03
    v3.project_hanger_rate = 0.42
    v3.project_finisher_rate = 0.55
    v3.lineItems = [
      line('drywall', {
        id: 'dw-plain',
        description: 'Walls',
        quantity: 8000,
        catalog_id: '1_2_type_x',
        finish_scope_id: 'level_4',
        custom_material_rate: 0.72,
        waste_pct: 10,
      }),
    ]
    const totals = computeQuoteV3Totals(v3, catalogs)
    const expectedLabor =
      totals.routine.hangerLaborSubtotal +
      totals.routine.finisherLaborSubtotal +
      totals.routine.componentLaborSubtotal +
      totals.routine.cleanupTotal
    const expectedMaterial =
      totals.routine.materialSubtotal +
      totals.routine.accessoriesSubtotal +
      totals.routine.salesTaxAmount

    const flattened = projectV3QuoteToV2Shape(v3, catalogs)
    const fin = buildOrderFinancialComparison(
      flattened,
      emptyTakeoff(8800),
      [],
      emptyRates(flattened),
      { v3Quote: v3, catalogs },
    )

    expect(cents(fin.baselineLaborWithTax)).toBe(cents(expectedLabor))
    expect(cents(fin.originalMaterialCost)).toBe(cents(expectedMaterial))
  })

  it('v2 quotes still read material from calculations rather than labour subtraction', () => {
    const quote = createEmptyDrywallQuote()
    quote.sqft = '1000'
    quote.wastePercentage = 10
    quote.hangerRate = 0.4
    quote.finisherRate = 0.5
    quote.prepCleanRate = 0.03
    quote.hangerIncludeLaborBurden = true
    quote.finisherIncludeLaborBurden = true
    quote.prepCleanIncludeLaborBurden = true
    quote.calculations = {
      totalLaborCost: 200,
      totalMaterialCost: 50,
      totalDirectCost: 250,
      subtotal: 275,
      finalTotal: 350,
    }
    quote.totalQuoteAmount = 350

    const fin = buildOrderFinancialComparison(
      quote,
      emptyTakeoff(1100),
      [],
      emptyRates(quote),
    )

    expect(fin.originalMaterialCost).toBe(50)
    expect(fin.baselineLaborWithTax).toBe(200)
    expect(fin.originalSqft).toBeCloseTo(1100, 5)
  })
})

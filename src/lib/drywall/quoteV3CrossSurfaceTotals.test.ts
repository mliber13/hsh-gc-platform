import { describe, expect, it } from 'vitest'
import { createDefaultDrywallCatalogSeeds } from './catalogSeeds'
import { createEmptyDrywallQuoteV3, createQuoteLineItem } from './createEmptyDrywallQuoteV3'
import { buildBidSnapshotFromV3Quote } from './bidSnapshot'
import { DEFAULT_MARGIN_FLOOR_TARGET } from './marginFloor'
import { projectV3QuoteToV2Shape } from './projectV3QuoteToV2Shape'
import { buildQuoteV3PdfLineRows } from './quoteV3PdfModel'
import { computeQuoteV3Totals } from './quoteV3Math'
import type { DrywallQuoteV3, QuoteLineItem } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

function cents(n: number): number {
  return Math.round(n * 100) / 100
}

function money(v: unknown): number {
  return cents(typeof v === 'number' ? v : Number(v) || 0)
}

function line(type: QuoteLineItem['type'], patch: Partial<QuoteLineItem>): QuoteLineItem {
  return {
    ...createQuoteLineItem(type),
    ...patch,
    type,
  }
}

function catalogsForMixedTrades(): OrgDrywallCatalogs {
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
  catalogs.insulation = [
    {
      id: 'ins-r13',
      display_name: 'R13 unfaced',
      r_value: '13',
      faced: false,
      rigid: false,
      material_rate_per_sqft: 0.45,
      labor_rate: 0.3,
    },
  ]
  catalogs.frp = [
    {
      id: 'frp-sheet',
      display_name: 'FRP sheet',
      component_type: 'sheet',
      unit: 'sqft',
      material_rate: 1.2,
      labor_rate: 0.8,
    },
  ]
  catalogs.door_install = [
    {
      id: 'door-1',
      display_name: 'Door install',
      material_rate: 25,
      labor_rate: 85,
    },
  ]
  catalogs.marginFloorTarget = DEFAULT_MARGIN_FLOOR_TARGET
  return catalogs
}

/** All eight line types, bead sticks, project rates, one selected deduct. */
function eightTradeQuote(): DrywallQuoteV3 {
  const quote = createEmptyDrywallQuoteV3()
  quote.overhead_pct = 10
  quote.profit_pct = 30
  quote.sales_tax_pct = 7.25
  quote.prep_clean_rate = 0.03
  quote.project_hanger_rate = 0.42
  quote.project_finisher_rate = 0.55
  quote.bead_sticks = 24
  quote.lineItems = [
    line('drywall', {
      id: 'dw-1',
      description: 'Walls',
      location: 'Floor 1',
      quantity: 8000,
      catalog_id: '1_2_type_x',
      finish_scope_id: 'level_4',
      custom_material_rate: 0.72,
      waste_pct: 10,
    }),
    line('rc_channel', {
      id: 'rc-1',
      description: 'RC ceiling',
      location: 'Floor 1',
      quantity: 2000,
      catalog_id: 'rc-1',
      rc_surface: 'ceiling',
      rc_spacing_in: 24,
      waste_pct: 10,
    }),
    line('suspended_grid', {
      id: 'sg-1',
      description: 'Grid',
      location: 'Lobby',
      quantity: 600,
      custom_material_rate: 1.4,
      custom_labor_rate: 2,
      waste_pct: 0,
    }),
    line('metal_stud', {
      id: 'ms-1',
      description: 'Studs',
      location: 'Corridor',
      quantity: 400,
      custom_material_rate: 4.5,
      custom_labor_rate: 3.2,
      waste_pct: 0,
    }),
    line('insulation', {
      id: 'ins-1',
      description: 'Batt',
      location: 'Exterior',
      quantity: 500,
      catalog_id: 'ins-r13',
      custom_material_rate: 0.5,
      custom_labor_rate: 0.35,
      waste_pct: 0,
    }),
    line('acoustic', {
      id: 'ac-1',
      description: 'ACT',
      location: 'Office',
      quantity: 400,
      custom_material_rate: 2.1,
      custom_labor_rate: 1.8,
      waste_pct: 0,
    }),
    line('frp', {
      id: 'frp-1',
      description: 'FRP',
      location: 'Restroom',
      quantity: 200,
      catalog_id: 'frp-sheet',
      custom_material_rate: 1.5,
      custom_labor_rate: 0.9,
      waste_pct: 0,
    }),
    line('door_install', {
      id: 'door-1',
      description: 'Doors',
      location: 'Units',
      quantity: 6,
      catalog_id: 'door-1',
      custom_material_rate: 40,
      custom_labor_rate: 90,
      waste_pct: 0,
    }),
  ]
  quote.alternates = [
    {
      id: 'alt-deduct',
      name: 'Deduct unused wing',
      description: 'Remove drywall at unused wing',
      pricingMode: 'deduct',
      selected: true,
      lineItems: [
        line('drywall', {
          id: 'alt-dw',
          description: 'Unused wing',
          location: 'Wing',
          quantity: 500,
          catalog_id: '1_2_type_x',
          finish_scope_id: 'level_4',
          custom_material_rate: 0.72,
          waste_pct: 10,
        }),
      ],
    },
  ]
  return quote
}

/** ~$40k drywall + ~$25k metal stud + ~$10k RC of direct cost. */
function mixedTradeMarginQuote(): DrywallQuoteV3 {
  const quote = createEmptyDrywallQuoteV3()
  quote.overhead_pct = 10
  quote.profit_pct = 30
  quote.sales_tax_pct = 7.25
  quote.prep_clean_rate = 0.03
  quote.project_hanger_rate = 0.45
  quote.project_finisher_rate = 0.55
  quote.lineItems = [
    line('drywall', {
      id: 'dw-mix',
      description: 'Hang and finish',
      location: 'All',
      quantity: 18000,
      catalog_id: '1_2_type_x',
      finish_scope_id: 'level_4',
      custom_material_rate: 0.9,
      waste_pct: 0,
    }),
    line('metal_stud', {
      id: 'ms-mix',
      description: 'Framing',
      location: 'All',
      quantity: 4000,
      custom_material_rate: 6.25,
      custom_labor_rate: 3.5,
      waste_pct: 0,
    }),
    line('rc_channel', {
      id: 'rc-mix',
      description: 'RC',
      location: 'Ceilings',
      quantity: 5000,
      catalog_id: 'rc-1',
      rc_surface: 'ceiling',
      rc_spacing_in: 24,
      waste_pct: 10,
    }),
  ]
  return quote
}

describe('T1 cross-surface totals invariant', () => {
  it('sidebar, bid snapshot, PDF rows and Order projection agree to the cent', () => {
    const catalogs = catalogsForMixedTrades()
    const quote = eightTradeQuote()
    const totals = computeQuoteV3Totals(quote, catalogs)
    const snapshot = buildBidSnapshotFromV3Quote(quote, catalogs, '2026-09-11T00:00:00.000Z')
    const pdfRows = buildQuoteV3PdfLineRows(quote, catalogs, false)
    const orderShape = projectV3QuoteToV2Shape(quote, catalogs)

    const pdfSum = pdfRows.reduce((sum, row) => sum + row.sellTotal, 0)
    const snapshotLineSum = snapshot.payload.lineItems.reduce(
      (sum, row) => sum + row.computed_line_total,
      0,
    )

    expect(money(snapshot.payload.bidTotal)).toBe(cents(totals.routine.total))
    expect(cents(pdfSum)).toBe(cents(totals.routine.total))
    // Order's contract total is acceptedTotal (selected deduct included). Written
    // first against routine.total: it failed 44460.39 vs 46193.13 — that delta is
    // the deduct, not the drywall-only cost bug. Cost agreement is T4.
    expect(money(orderShape.calculations?.finalTotal)).toBe(cents(totals.acceptedTotal))
    expect(cents(snapshotLineSum)).toBe(cents(totals.routine.linesSubtotal))
  })
})

describe('T4 Order-page margin on a mixed-trade quote', () => {
  it('direct cost includes component labor and component material, so margin is near the markup target', () => {
    const catalogs = catalogsForMixedTrades()
    const quote = mixedTradeMarginQuote()
    const totals = computeQuoteV3Totals(quote, catalogs)
    const routine = totals.routine
    const orderShape = projectV3QuoteToV2Shape(quote, catalogs)
    const calc = orderShape.calculations ?? {}
    const totalLaborCost = money(calc.totalLaborCost)
    const totalMaterialCost = money(calc.totalMaterialCost)
    const totalDirectCost = money(calc.totalDirectCost)
    const bid = money(calc.finalTotal)

    const componentMaterial =
      (routine.byTrade?.metal_stud?.material ?? 0) + (routine.byTrade?.rc_channel?.material ?? 0)
    const componentLabor = routine.componentLaborSubtotal
    expect(componentMaterial).toBeGreaterThan(20_000)
    expect(componentLabor).toBeGreaterThan(5_000)

    const expectedLabor =
      routine.hangerLaborSubtotal +
      routine.finisherLaborSubtotal +
      routine.componentLaborSubtotal +
      routine.cleanupTotal
    const expectedMaterial =
      routine.materialSubtotal + routine.accessoriesSubtotal + routine.salesTaxAmount

    expect(totalLaborCost).toBe(cents(expectedLabor))
    expect(totalMaterialCost).toBe(cents(expectedMaterial))
    expect(totalDirectCost).toBe(cents(expectedLabor + expectedMaterial))

    const margin = bid > 0 ? (bid - totalDirectCost) / bid : 0
    // OH 10% then profit 30% → (0.10 + 0.33) / 1.43 ≈ 30.07%, near the 30% org floor.
    const markupMargin =
      (routine.overheadAmount + routine.profitAmount) / routine.total
    expect(margin).toBeCloseTo(markupMargin, 3)
    expect(margin).toBeLessThan(0.4)
    expect(margin).toBeCloseTo(catalogs.marginFloorTarget, 1)
  })
})

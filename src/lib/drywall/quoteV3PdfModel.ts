import {

  computeLineItem,

  computeMarkupBreakdown,

  computeQuoteV3Totals,

  DEFAULT_PREP_CLEAN_RATE,

  lineDirectCostsFromLines,

  linesSubtotalFromLines,

  type QuoteV3LaborBurdenOptions,

  type QuoteV3TotalsSummary,

} from './quoteV3Math'

import { QUOTE_LINE_TYPE_LABELS } from './quoteV3CatalogResolve'

import type { DrywallQuoteV3, QuoteAlternate, QuoteLineItem, QuoteLineItemType } from '@/types/drywall'

import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'



export const PDF_TRADE_ORDER: QuoteLineItemType[] = [

  'drywall',

  'rc_channel',

  'suspended_grid',

  'insulation',

  'acoustic',

  'metal_stud',

  'frp',

]



export interface QuoteV3PdfLineRow {

  line: QuoteLineItem

  location: string

  sellTotal: number

  trade: QuoteLineItemType

}



export interface QuoteV3PdfAlternateBlock {

  alternate: QuoteAlternate

  totalAdd: number

  rows: QuoteV3PdfLineRow[]

}



/** Leading "5,000 sqft of …" / "1,200 LF …" prefixes — not shown on customer PDF. */

const PDF_QTY_LEADING_RE =

  /^\s*\d+(?:,\d{3})*(?:\.\d+)?\s*(?:sq\.?\s*ft\.?|sqft|sf|square\s*feet|lf|ln\.?\s*ft\.?|linear\s*feet|each|ea\.?|pcs?\.?|pieces?)\s*(?:of\s+)?/i



export function stripQuantityFromCustomerPdfDescription(text: string): string {

  const trimmed = text.trim()

  if (!trimmed) return trimmed

  return trimmed.replace(PDF_QTY_LEADING_RE, '').trim()

}



function round2(n: number): number {

  return Math.round(n * 100) / 100

}



function laborBurdenFromQuote(quote: DrywallQuoteV3): QuoteV3LaborBurdenOptions {

  return {

    hangerIncludeLaborBurden: quote.hanger_include_labor_burden,

    finisherIncludeLaborBurden: quote.finisher_include_labor_burden,

    prepCleanIncludeLaborBurden: quote.prep_clean_include_labor_burden,

    projectHangerRate: quote.project_hanger_rate,

    projectFinisherRate: quote.project_finisher_rate,

  }

}



function drywallWasteSqft(line: QuoteLineItem): number {

  const qty = line.quantity || 0

  const wastePct = line.waste_pct ?? 10

  return qty * (1 + wastePct / 100)

}



export function formatPdfLineLocation(line: QuoteLineItem): string {

  return line.location?.trim() || '—'

}



function allocateLineSellTotals(params: {

  lineItems: QuoteLineItem[]

  catalogs: OrgDrywallCatalogs

  laborBurden: QuoteV3LaborBurdenOptions

  totalSell: number

  markupBase: number

  salesTaxPct: number

  cleanupTotal?: number

  totalDrywallWasteSqft?: number

}): QuoteV3PdfLineRow[] {

  const {

    lineItems,

    catalogs,

    laborBurden,

    totalSell,

    markupBase,

    salesTaxPct,

    cleanupTotal = 0,

    totalDrywallWasteSqft = 0,

  } = params



  const weighted = lineItems.map((line) => {

    const computed = computeLineItem(line, catalogs, laborBurden)

    let weight = computed.lineTotal

    if (line.type === 'drywall' && totalDrywallWasteSqft > 0 && cleanupTotal > 0) {

      weight += cleanupTotal * (drywallWasteSqft(line) / totalDrywallWasteSqft)

    }

    const taxableMaterial =

      line.type === 'drywall'

        ? computed.materialTotal + computed.accessoriesTotal

        : computed.materialTotal

    weight += taxableMaterial * (salesTaxPct / 100)

    return { line, weight }

  })



  let allocated = 0

  return weighted.map(({ line, weight }, idx) => {

    let sellTotal = 0

    if (markupBase > 0 && totalSell > 0) {

      if (idx === weighted.length - 1) {

        sellTotal = round2(totalSell - allocated)

      } else {

        sellTotal = round2(totalSell * (weight / markupBase))

        allocated += sellTotal

      }

    }

    return {

      line,

      location: formatPdfLineLocation(line),

      sellTotal,

      trade: line.type,

    }

  })

}



/** Customer sell price per routine line — proportional share of routine.total. */

export function buildQuoteV3PdfLineRows(

  quote: DrywallQuoteV3,

  catalogs: OrgDrywallCatalogs,

): QuoteV3PdfLineRow[] {

  const laborBurden = laborBurdenFromQuote(quote)

  const totals = computeQuoteV3Totals(quote, catalogs)

  const routine = totals.routine



  return allocateLineSellTotals({

    lineItems: quote.lineItems,

    catalogs,

    laborBurden,

    totalSell: routine.total,

    markupBase: routine.markupBase,

    salesTaxPct: quote.sales_tax_pct ?? 0,

    cleanupTotal: routine.cleanupTotal,

    totalDrywallWasteSqft: routine.cleanupDrywallSqft,

  })

}



export function buildQuoteV3PdfAlternateBlocks(

  quote: DrywallQuoteV3,

  catalogs: OrgDrywallCatalogs,

  totals: QuoteV3TotalsSummary,

): QuoteV3PdfAlternateBlock[] {

  const laborBurden = laborBurdenFromQuote(quote)

  const prepCleanRate = quote.prep_clean_rate ?? DEFAULT_PREP_CLEAN_RATE



  return quote.alternates.map((alt, idx) => {

    const totalAdd =
      totals.alternates.find((a) => a.id === alt.id)?.totalAdd ?? 0

    const altDirect = lineDirectCostsFromLines(alt.lineItems, catalogs, laborBurden)

    const linesSub = linesSubtotalFromLines(alt.lineItems, catalogs, laborBurden)

    const marked = computeMarkupBreakdown(

      linesSub,

      0,

      quote.overhead_pct,

      quote.profit_pct,

      quote.sales_tax_pct,

      0,

      prepCleanRate,

      altDirect,

    )

    const rows = allocateLineSellTotals({

      lineItems: alt.lineItems,

      catalogs,

      laborBurden,

      totalSell: totalAdd,

      markupBase: marked.markupBase,

      salesTaxPct: quote.sales_tax_pct ?? 0,

    })

    return { alternate: alt, totalAdd, rows }

  })

}



function pdfLocationKey(location: string): string {

  return location.trim().toLowerCase() || '—'

}



/** Collapse line rows for customer PDF location table: one total when all lines share a location; per-location subtotals when not. */

export function groupPdfRowsByLocationForDisplay(

  rows: QuoteV3PdfLineRow[],

): QuoteV3PdfLineRow[] {

  if (rows.length <= 1) return rows



  const byLocation = new Map<string, { location: string; sellTotal: number }>()

  for (const row of rows) {

    const key = pdfLocationKey(row.location)

    const existing = byLocation.get(key)

    if (existing) {

      existing.sellTotal = round2(existing.sellTotal + row.sellTotal)

    } else {

      byLocation.set(key, {

        location: row.location?.trim() || '—',

        sellTotal: row.sellTotal,

      })

    }

  }



  if (byLocation.size === 1) {

    const only = [...byLocation.values()][0]

    return [

      {

        ...rows[0],

        location: only.location,

        sellTotal: only.sellTotal,

      },

    ]

  }



  const seen = new Set<string>()

  const grouped: QuoteV3PdfLineRow[] = []

  for (const row of rows) {

    const key = pdfLocationKey(row.location)

    if (seen.has(key)) continue

    seen.add(key)

    const agg = byLocation.get(key)!

    grouped.push({

      ...row,

      location: agg.location,

      sellTotal: agg.sellTotal,

    })

  }

  return grouped

}



export function groupPdfRowsByTrade(

  rows: QuoteV3PdfLineRow[],

): Array<{ trade: QuoteLineItemType; label: string; rows: QuoteV3PdfLineRow[]; subtotal: number }> {

  const byTrade = new Map<QuoteLineItemType, QuoteV3PdfLineRow[]>()

  for (const row of rows) {

    const list = byTrade.get(row.trade) ?? []

    list.push(row)

    byTrade.set(row.trade, list)

  }

  return PDF_TRADE_ORDER.filter((t) => (byTrade.get(t)?.length ?? 0) > 0).map((trade) => {

    const tradeRows = byTrade.get(trade) ?? []

    return {

      trade,

      label: QUOTE_LINE_TYPE_LABELS[trade],

      rows: tradeRows,

      subtotal: round2(tradeRows.reduce((s, r) => s + r.sellTotal, 0)),

    }

  })

}



export function sanitizePdfFilenamePart(value: string): string {

  return value.replace(/[/\\:*?"<>|]/g, '-').trim() || 'Project'

}



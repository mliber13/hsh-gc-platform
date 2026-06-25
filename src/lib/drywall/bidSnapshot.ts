import { buildDrywallQuoteCalculations } from '@/lib/drywall/buildDrywallQuoteCalculations'
import { calculateQuoteTotals } from '@/lib/drywall/quoteCalculations'
import {
  computeLineItem,
  computeQuoteV3Totals,
  type QuoteV3LaborBurdenOptions,
} from '@/lib/drywall/quoteV3Math'
import type {
  BidSnapshot,
  BidSnapshotPayload,
  DrywallQuote,
  DrywallQuoteCalculations,
  DrywallQuoteV3,
  QuoteBreakdown,
  QuoteOption,
} from '@/types/drywall'
import { isDrywallQuoteV3 } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : 0
}

function laborBurdenFromV3Quote(quote: DrywallQuoteV3): QuoteV3LaborBurdenOptions {
  return {
    hangerIncludeLaborBurden: quote.hanger_include_labor_burden,
    finisherIncludeLaborBurden: quote.finisher_include_labor_burden,
    prepCleanIncludeLaborBurden: quote.prep_clean_include_labor_burden,
  }
}

export function buildBidSnapshotFromV3Quote(
  quote: DrywallQuoteV3,
  catalogs: OrgDrywallCatalogs,
  at: string,
): BidSnapshot {
  const laborBurden = laborBurdenFromV3Quote(quote)
  const totals = computeQuoteV3Totals(quote, catalogs)
  const routine = totals.routine

  const lineItems = quote.lineItems.map((line) => {
    const computed = computeLineItem(line, catalogs, laborBurden)
    const description =
      line.type === 'drywall'
        ? `${computed.catalogLabel} — ${computed.finishLabel}`
        : computed.catalogLabel
    return {
      id: line.id,
      type: line.type,
      description,
      ...(line.location?.trim() ? { location: line.location.trim() } : {}),
      computed_line_total: computed.lineTotal,
    }
  })

  const alternates = quote.alternates.map((alt) => {
    const summary = totals.alternates.find((a) => a.id === alt.id)
    return {
      id: alt.id,
      name: alt.name || 'Alternate',
      totalAdd: summary?.totalAdd ?? 0,
      selected: Boolean(alt.selected),
    }
  })

  const payload: BidSnapshotPayload = {
    routineSubtotal: routine.linesSubtotal,
    cleanupTotal: routine.cleanupTotal,
    overhead: routine.overheadAmount,
    profit: routine.profitAmount,
    salesTax: routine.salesTaxAmount,
    bidTotal: routine.total,
    lineItems,
    alternates,
  }

  return {
    total: routine.total,
    at,
    payload,
  }
}

function optionTotalAdd(opt: QuoteOption, calculations: DrywallQuoteCalculations): number {
  const optionSqft = opt.useTotalSqft ? num(calculations.sqft) : num(opt.sqft)
  const optionRate = num(opt.rate)
  if (optionSqft > 0 && optionRate > 0) return optionSqft * optionRate
  return num(opt.price)
}

function breakdownLineTotal(item: QuoteBreakdown, calculations: DrywallQuoteCalculations): number {
  const stored = num(item.itemTotal)
  if (stored > 0) return stored
  const drywall = num(item.drywallTotal)
  const rc = num(item.rcChannelTotal)
  const suspended = num(item.suspendedGridTotal)
  const metalStud = num(item.metalStudTotal)
  const sum = drywall + rc + suspended + metalStud
  if (sum > 0) return sum
  return num(calculations.breakdownTotal) / Math.max(1, (calculations as { breakdownCount?: number }).breakdownCount ?? 1)
}

function buildV2LineItems(
  quote: DrywallQuote,
  calculations: DrywallQuoteCalculations,
): BidSnapshotPayload['lineItems'] {
  const breakdowns = quote.breakdowns ?? []
  if (breakdowns.length > 0) {
    return breakdowns.map((item) => ({
      id: item.id,
      type: 'drywall',
      description: String(item.description ?? 'Drywall breakdown').trim() || 'Drywall breakdown',
      computed_line_total: breakdownLineTotal(item, calculations),
    }))
  }

  const routineDirect =
    num(calculations.standardDrywallDirectCost) ||
    Math.max(0, num(calculations.totalDirectCost) - num(calculations.prepCleanCostWithTax ?? calculations.prepCleanCost))

  return [
    {
      id: 'routine',
      type: 'drywall',
      description: 'Drywall (routine)',
      computed_line_total: routineDirect,
    },
  ]
}

export function buildBidSnapshotFromV2Quote(quote: DrywallQuote, at: string): BidSnapshot {
  const quoteForCalc = { ...quote, version: undefined } as DrywallQuote
  const calculations = buildDrywallQuoteCalculations(quote) as DrywallQuoteCalculations
  const totals = calculateQuoteTotals(quoteForCalc, calculations)

  const prepClean = num(calculations.prepCleanCostWithTax ?? calculations.prepCleanCost)
  const salesTax = num(calculations.salesTax ?? totals.totalSalesTax)
  const overhead = num(calculations.overheadAmount)
  const profit = num(calculations.profitAmount)
  const bidTotal = num(calculations.finalTotal ?? totals.totalQuote)
  const totalDirect = num(calculations.totalDirectCost)
  const routineSubtotal = Math.max(0, totalDirect - prepClean - salesTax)

  const lineItems = buildV2LineItems(quote, calculations)
  const alternates = (quote.options ?? []).map((opt) => ({
    id: opt.id,
    name: String(opt.name ?? opt.description ?? 'Option').trim() || 'Option',
    totalAdd: optionTotalAdd(opt, calculations),
    selected: Boolean(opt.selected),
  }))

  const payload: BidSnapshotPayload = {
    routineSubtotal,
    cleanupTotal: prepClean,
    overhead,
    profit,
    salesTax,
    bidTotal,
    lineItems,
    alternates,
  }

  return {
    total: bidTotal,
    at,
    payload,
  }
}

export async function buildBidSnapshotForQuote(
  quote: DrywallQuote | DrywallQuoteV3,
  catalogs: OrgDrywallCatalogs | null,
  at: string,
): Promise<BidSnapshot> {
  if (isDrywallQuoteV3(quote)) {
    if (!catalogs) throw new Error('Catalogs required to snapshot v3 quote')
    return buildBidSnapshotFromV3Quote(quote, catalogs, at)
  }
  return buildBidSnapshotFromV2Quote(quote, at)
}

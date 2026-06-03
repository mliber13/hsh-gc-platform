// @ts-nocheck — parity port from OrderStage.jsx financialComparison useMemo
import { applyLaborBurden } from '@/lib/drywall/calculations/quantityUtils'
import { calculateQuoteTotals } from '@/lib/drywall/quoteCalculations'
import type { DrywallChangeOrder, DrywallQuote, FieldTakeoff } from '@/types/drywall'

export interface OrderReviewLaborRatesInput {
  hangerRate: string
  finisherRate: string
  prepCleanRate: string
  reviewNotes?: string
}

export interface OrderLaborRateSet {
  hangerRate: number
  finisherRate: number
  prepCleanRate: number
}

export interface OrderFinancialComparison {
  originalSqft: number
  revisedSqft: number
  varianceSqft: number
  variancePercent: number
  originalHangerRate: number
  revisedHangerRate: number
  originalFinisherRate: number
  revisedFinisherRate: number
  originalPrepRate: number
  revisedPrepRate: number
  baselineTotal: number
  baselineDirect: number
  baselineProfit: number
  baselineMargin: number
  adjustedTotal: number
  adjustedDirect: number
  adjustedProfit: number
  adjustedMargin: number
  baselineLaborWithTax: number
  adjustedLaborWithTax: number
  originalMaterialCost: number
  revisedMaterialCost: number
  originalHangerPay: number
  revisedHangerPay: number
  originalFinisherPay: number
  revisedFinisherPay: number
  originalPrepPay: number
  revisedPrepPay: number
  deltaTotal: number
  deltaDirect: number
  deltaProfit: number
  deltaMargin: number
  deltaLaborWithTax: number
  approvedChangeOrderRevenue: number
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : fallback
}

function laborWithBurdenForSqft(
  sqft: number,
  rates: OrderLaborRateSet,
  quote: DrywallQuote,
): number {
  return (
    applyLaborBurden(sqft * rates.hangerRate, quote.hangerIncludeLaborBurden) +
    applyLaborBurden(sqft * rates.finisherRate, quote.finisherIncludeLaborBurden) +
    applyLaborBurden(sqft * rates.prepCleanRate, quote.prepCleanIncludeLaborBurden)
  )
}

function ratesFromQuoteCalc(quote: DrywallQuote): Partial<OrderLaborRateSet> {
  const calc = quote.calculations as Record<string, unknown> | undefined
  const calcHangSqft = num(calc?.hangSqft)
  const calcFinishSqft = num(calc?.finishSqft)
  return {
    hangerRate: calcHangSqft > 0 ? num(calc?.hangerCost) / calcHangSqft : undefined,
    finisherRate: calcFinishSqft > 0 ? num(calc?.finisherCost) / calcFinishSqft : undefined,
    prepCleanRate: calcFinishSqft > 0 ? num(calc?.prepCleanCost) / calcFinishSqft : undefined,
  }
}

export function resolveOrderBaselineRates(
  quote: DrywallQuote,
  fieldTakeoff: FieldTakeoff,
): OrderLaborRateSet {
  const fromCalc = ratesFromQuoteCalc(quote)
  const stored = fieldTakeoff.reviewBaselineRates as Record<string, unknown> | undefined
  if (stored && (stored.hangerRate != null || stored.finisherRate != null)) {
    return {
      hangerRate: num(stored.hangerRate, num(quote.hangerRate, fromCalc.hangerRate ?? 0.27)),
      finisherRate: num(stored.finisherRate, num(quote.finisherRate, fromCalc.finisherRate ?? 0.27)),
      prepCleanRate: num(stored.prepCleanRate, num(quote.prepCleanRate, fromCalc.prepCleanRate ?? 0.03)),
    }
  }
  return {
    hangerRate: num(quote.hangerRate, fromCalc.hangerRate ?? 0.27),
    finisherRate: num(quote.finisherRate, fromCalc.finisherRate ?? 0.27),
    prepCleanRate: num(quote.prepCleanRate, fromCalc.prepCleanRate ?? 0.03),
  }
}

export function resolveOrderRevisedRates(
  quote: DrywallQuote,
  fieldTakeoff: FieldTakeoff,
  reviewLaborRates: OrderReviewLaborRatesInput,
): OrderLaborRateSet {
  const baseline = resolveOrderBaselineRates(quote, fieldTakeoff)
  const approved = fieldTakeoff.reviewApprovedRates as Record<string, unknown> | undefined

  if (fieldTakeoff.reviewStatus === 'pending_review') {
    return {
      hangerRate: num(reviewLaborRates.hangerRate, baseline.hangerRate),
      finisherRate: num(reviewLaborRates.finisherRate, baseline.finisherRate),
      prepCleanRate: num(reviewLaborRates.prepCleanRate, baseline.prepCleanRate),
    }
  }

  if (approved && approved.hangerRate != null) {
    return {
      hangerRate: num(approved.hangerRate, baseline.hangerRate),
      finisherRate: num(approved.finisherRate, baseline.finisherRate),
      prepCleanRate: num(approved.prepCleanRate, baseline.prepCleanRate),
    }
  }

  return {
    hangerRate: num(reviewLaborRates.hangerRate, num(quote.hangerRate, baseline.hangerRate)),
    finisherRate: num(reviewLaborRates.finisherRate, num(quote.finisherRate, baseline.finisherRate)),
    prepCleanRate: num(reviewLaborRates.prepCleanRate, num(quote.prepCleanRate, baseline.prepCleanRate)),
  }
}

export function buildOrderFinancialComparison(
  quote: DrywallQuote,
  fieldTakeoff: FieldTakeoff,
  changeOrders: DrywallChangeOrder[],
  reviewLaborRates: OrderReviewLaborRatesInput,
): OrderFinancialComparison {
  const fieldSqft = fieldTakeoff.totalMeasuredSqft || 0
  const baseQuoteSqft = num(quote.sqft)
  const wastePct = Math.round(num(quote.wastePercentage))
  const quoteSqft = Math.round(baseQuoteSqft * (1 + wastePct / 100))

  const baselineRates = resolveOrderBaselineRates(quote, fieldTakeoff)
  const revisedRates = resolveOrderRevisedRates(quote, fieldTakeoff, reviewLaborRates)

  const baselineQuote = {
    ...quote,
    hangerRate: baselineRates.hangerRate,
    finisherRate: baselineRates.finisherRate,
    prepCleanRate: baselineRates.prepCleanRate,
  } as DrywallQuote

  const baselineTotals = calculateQuoteTotals(
    { ...baselineQuote, version: undefined },
    (quote.calculations || {}) as never,
  )
  const overriddenQuoteTotal = num(quote.totalQuoteAmount)
  const baselineTotal =
    overriddenQuoteTotal > 0 ? overriddenQuoteTotal : baselineTotals?.totalQuote || 0
  const baselineDirect = baselineTotals?.totalDirectCost || 0
  const baselineSubtotal = baselineTotals?.subtotal || 0
  const baselineProfit = baselineTotal - baselineSubtotal
  const baselineMargin = baselineTotal > 0 ? (baselineProfit / baselineTotal) * 100 : 0
  const overheadPct = num(quote.overheadPercentage)

  const effectiveSqft = fieldSqft > 0 ? fieldSqft : quoteSqft
  const sqftScale = quoteSqft > 0 && effectiveSqft > 0 ? effectiveSqft / quoteSqft : 1

  const baselineLaborWithTax = laborWithBurdenForSqft(quoteSqft, baselineRates, quote)
  const adjustedLaborWithTax = laborWithBurdenForSqft(effectiveSqft, revisedRates, quote)

  const deltaLaborWithTax = adjustedLaborWithTax - baselineLaborWithTax
  const originalMaterialCost = Math.max(0, baselineDirect - baselineLaborWithTax)
  const revisedMaterialCost = originalMaterialCost * sqftScale
  const adjustedDirect = revisedMaterialCost + adjustedLaborWithTax
  const deltaDirect = adjustedDirect - baselineDirect
  const subtotalDelta = deltaDirect * (1 + overheadPct / 100)

  const approvedChangeOrderRevenue = changeOrders.reduce(
    (sum, co) =>
      String(co.status || '').toLowerCase() === 'approved'
        ? sum + num(co.requestedAmount)
        : sum,
    0,
  )

  const adjustedSubtotal = baselineSubtotal + subtotalDelta
  const adjustedTotal = baselineTotal + approvedChangeOrderRevenue
  const adjustedProfit = adjustedTotal - adjustedSubtotal
  const adjustedMargin = adjustedTotal > 0 ? (adjustedProfit / adjustedTotal) * 100 : 0

  const varianceSqft = effectiveSqft - quoteSqft
  const variancePercent = quoteSqft > 0 ? (varianceSqft / quoteSqft) * 100 : 0

  return {
    originalSqft: quoteSqft,
    revisedSqft: effectiveSqft,
    varianceSqft,
    variancePercent,
    originalHangerRate: baselineRates.hangerRate,
    revisedHangerRate: revisedRates.hangerRate,
    originalFinisherRate: baselineRates.finisherRate,
    revisedFinisherRate: revisedRates.finisherRate,
    originalPrepRate: baselineRates.prepCleanRate,
    revisedPrepRate: revisedRates.prepCleanRate,
    baselineTotal,
    baselineDirect,
    baselineProfit,
    baselineMargin,
    adjustedTotal,
    adjustedDirect,
    adjustedProfit,
    adjustedMargin,
    baselineLaborWithTax,
    adjustedLaborWithTax,
    originalMaterialCost,
    revisedMaterialCost,
    originalHangerPay: quoteSqft * baselineRates.hangerRate,
    revisedHangerPay: effectiveSqft * revisedRates.hangerRate,
    originalFinisherPay: quoteSqft * baselineRates.finisherRate,
    revisedFinisherPay: effectiveSqft * revisedRates.finisherRate,
    originalPrepPay: quoteSqft * baselineRates.prepCleanRate,
    revisedPrepPay: effectiveSqft * revisedRates.prepCleanRate,
    deltaTotal: approvedChangeOrderRevenue,
    deltaDirect,
    deltaProfit: adjustedProfit - baselineProfit,
    deltaMargin: adjustedMargin - baselineMargin,
    deltaLaborWithTax,
    approvedChangeOrderRevenue,
  }
}

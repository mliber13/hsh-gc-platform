// @ts-nocheck — parity port from OrderStage.jsx financialComparison useMemo
import { calculateQuoteTotals } from '@/lib/drywall/quoteCalculations'
import type { DrywallChangeOrder, DrywallQuote, FieldTakeoff } from '@/types/drywall'

const LABOR_TAX_RATE = 0.0765

export interface OrderFinancialComparison {
  originalSqft: number
  revisedSqft: number
  originalHangerRate: number
  revisedHangerRate: number
  originalFinisherRate: number
  revisedFinisherRate: number
  originalPrepRate: number
  revisedPrepRate: number
  baselineTotal: number
  adjustedTotal: number
  deltaTotal: number
  deltaDirect: number
  deltaLaborWithTax: number
  baselineMargin: number
  adjustedMargin: number
}

export function buildOrderFinancialComparison(
  quote: DrywallQuote,
  fieldTakeoff: FieldTakeoff,
  changeOrders: DrywallChangeOrder[],
  reviewRates?: { hangerRate: string; finisherRate: string; prepCleanRate: string },
  reviewStatus?: string | null,
): OrderFinancialComparison {
  const fieldSqft = fieldTakeoff.totalMeasuredSqft || 0
  const baseQuoteSqft = parseFloat(String(quote.sqft)) || 0
  const wastePct = Math.round(parseFloat(String(quote.wastePercentage)) || 0)
  const quoteSqft = Math.round(baseQuoteSqft * (1 + wastePct / 100))

  const calc = quote.calculations as Record<string, unknown> | undefined
  const calcHangSqft = parseFloat(String(calc?.hangSqft)) || 0
  const calcFinishSqft = parseFloat(String(calc?.finishSqft)) || 0
  const calcHangerRate =
    calcHangSqft > 0 ? (parseFloat(String(calc?.hangerCost)) || 0) / calcHangSqft : 0
  const calcFinisherRate =
    calcFinishSqft > 0 ? (parseFloat(String(calc?.finisherCost)) || 0) / calcFinishSqft : 0
  const calcPrepRate =
    calcFinishSqft > 0 ? (parseFloat(String(calc?.prepCleanCost)) || 0) / calcFinishSqft : 0

  const baselineRates = fieldTakeoff.reviewBaselineRates || {
    hangerRate:
      parseFloat(String(fieldTakeoff.reviewBaselineRates?.hangerRate)) ||
      parseFloat(String(quote.hangerRate)) ||
      calcHangerRate ||
      0.27,
    finisherRate:
      parseFloat(String(fieldTakeoff.reviewBaselineRates?.finisherRate)) ||
      parseFloat(String(quote.finisherRate)) ||
      calcFinisherRate ||
      0.27,
    prepCleanRate:
      parseFloat(String(fieldTakeoff.reviewBaselineRates?.prepCleanRate)) ||
      parseFloat(String(quote.prepCleanRate)) ||
      calcPrepRate ||
      0.03,
  }

  const approvedRates = fieldTakeoff.reviewApprovedRates || {
    hangerRate: parseFloat(String(quote.hangerRate)) || 0.27,
    finisherRate: parseFloat(String(quote.finisherRate)) || 0.27,
    prepCleanRate: parseFloat(String(quote.prepCleanRate)) || 0.03,
  }

  const revisedRates =
    reviewStatus === 'pending_review' && reviewRates
      ? {
          hangerRate: parseFloat(reviewRates.hangerRate) || Number(baselineRates.hangerRate) || 0,
          finisherRate:
            parseFloat(reviewRates.finisherRate) || Number(baselineRates.finisherRate) || 0,
          prepCleanRate:
            parseFloat(reviewRates.prepCleanRate) || Number(baselineRates.prepCleanRate) || 0,
        }
      : approvedRates

  const baselineQuote = {
    ...quote,
    hangerRate: baselineRates.hangerRate,
    finisherRate: baselineRates.finisherRate,
    prepCleanRate: baselineRates.prepCleanRate,
  } as DrywallQuote

  const baselineTotals = calculateQuoteTotals(baselineQuote, (quote.calculations || {}) as never)
  const overriddenQuoteTotal = parseFloat(String(quote.totalQuoteAmount)) || 0
  const baselineTotal =
    overriddenQuoteTotal > 0 ? overriddenQuoteTotal : baselineTotals?.totalQuote || 0
  const baselineDirect = baselineTotals?.totalDirectCost || 0
  const baselineSubtotal = baselineTotals?.subtotal || 0
  const baselineProfit = baselineTotal - baselineSubtotal
  const baselineMargin = baselineTotal > 0 ? (baselineProfit / baselineTotal) * 100 : 0
  const overheadPct = parseFloat(String(quote.overheadPercentage)) || 0
  const profitPct = parseFloat(String(quote.profitPercentage)) || 0

  const effectiveSqft = fieldSqft > 0 ? fieldSqft : quoteSqft
  const sqftScale = quoteSqft > 0 && effectiveSqft > 0 ? effectiveSqft / quoteSqft : 1

  const baselineLaborWithTax =
    quoteSqft *
    (Number(baselineRates.hangerRate) +
      Number(baselineRates.finisherRate) +
      Number(baselineRates.prepCleanRate)) *
    (1 + LABOR_TAX_RATE)
  const adjustedLaborWithTax =
    effectiveSqft *
    (Number(revisedRates.hangerRate) +
      Number(revisedRates.finisherRate) +
      Number(revisedRates.prepCleanRate)) *
    (1 + LABOR_TAX_RATE)

  const deltaLaborWithTax = adjustedLaborWithTax - baselineLaborWithTax
  const originalMaterialCost = Math.max(0, baselineDirect - baselineLaborWithTax)
  const revisedMaterialCost = originalMaterialCost * sqftScale
  const adjustedDirect = revisedMaterialCost + adjustedLaborWithTax
  const deltaDirect = adjustedDirect - baselineDirect
  const subtotalDelta = deltaDirect * (1 + overheadPct / 100)
  const approvedChangeOrderRevenue = changeOrders.reduce(
    (sum, co) =>
      String(co.status || '').toLowerCase() === 'approved'
        ? sum + (parseFloat(String(co.requestedAmount)) || 0)
        : sum,
    0,
  )
  const adjustedSubtotal = baselineSubtotal + subtotalDelta
  const adjustedTotal = baselineTotal + approvedChangeOrderRevenue
  const adjustedProfit = adjustedTotal - adjustedSubtotal
  const adjustedMargin = adjustedTotal > 0 ? (adjustedProfit / adjustedTotal) * 100 : 0

  return {
    originalSqft: quoteSqft,
    revisedSqft: effectiveSqft,
    originalHangerRate: Number(baselineRates.hangerRate),
    revisedHangerRate: Number(revisedRates.hangerRate),
    originalFinisherRate: Number(baselineRates.finisherRate),
    revisedFinisherRate: Number(revisedRates.finisherRate),
    originalPrepRate: Number(baselineRates.prepCleanRate),
    revisedPrepRate: Number(revisedRates.prepCleanRate),
    baselineTotal,
    adjustedTotal,
    deltaTotal: approvedChangeOrderRevenue,
    deltaDirect,
    deltaLaborWithTax,
    baselineMargin,
    adjustedMargin,
  }
}

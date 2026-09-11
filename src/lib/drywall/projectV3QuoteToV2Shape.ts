import { createEmptyDrywallQuote } from './createEmptyDrywallQuote'
import {
  getEffectiveFinisherRate,
  getEffectiveHangerRate,
  getLineMaterialRate,
} from './quoteV3CatalogResolve'
import { computeQuoteV3Totals } from './quoteV3Math'
import type { DrywallQuote, DrywallQuoteV3 } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

function avgPositive(values: number[]): number | undefined {
  const positive = values.filter((v) => v > 0)
  if (positive.length === 0) return undefined
  return positive.reduce((sum, v) => sum + v, 0) / positive.length
}

/** v2-shape projection for legacy consumers (Order financial card, PDFs). */
export function projectV3QuoteToV2Shape(
  v3: DrywallQuoteV3,
  catalogs: OrgDrywallCatalogs,
): DrywallQuote {
  const base = createEmptyDrywallQuote()
  const drywallLines = v3.lineItems.filter((line) => line.type === 'drywall')
  const totalSqft = drywallLines.reduce((sum, line) => sum + (line.quantity || 0), 0)
  const wastePct = drywallLines[0]?.waste_pct ?? 10

  const projectHanger = v3.project_hanger_rate
  const projectFinisher = v3.project_finisher_rate

  const hangerRate =
    projectHanger != null && projectHanger > 0
      ? projectHanger
      : avgPositive(
          drywallLines.map((line) =>
            getEffectiveHangerRate(line, catalogs, projectHanger),
          ),
        ) ?? base.hangerRate

  const finisherRate =
    projectFinisher != null && projectFinisher > 0
      ? projectFinisher
      : avgPositive(
          drywallLines.map((line) =>
            getEffectiveFinisherRate(line, catalogs, projectFinisher),
          ),
        ) ?? base.finisherRate

  const materialRate =
    avgPositive(drywallLines.map((line) => getLineMaterialRate(line, catalogs))) ??
    base.materialRate

  // Derive totals from the v3 math so v2 consumers (Order Financial Card) have real numbers.
  const v3Totals = computeQuoteV3Totals(v3, catalogs)
  const routine = v3Totals.routine
  // Accepted alternates fold into the carried-forward total + estimate sqft (a
  // deduct lowers both). Equals the base when nothing is accepted.
  const effectiveSqft = v3Totals.acceptedSqft
  // materialSubtotal is bare board/component material; accessories are separate.
  let materialCostBare = routine.materialSubtotal
  let accessoriesCost = routine.accessoriesSubtotal
  let hangerCost = routine.hangerLaborSubtotal
  let finisherCost = routine.finisherLaborSubtotal
  let componentCost = routine.componentLaborSubtotal
  let prepCleanCost = routine.cleanupTotal
  let salesTax = routine.salesTaxAmount
  let overheadAmount = routine.overheadAmount
  let profitAmount = routine.profitAmount

  // Net ACCEPTED alternates into the cost breakdown (deduct subtracts) so cost
  // matches the accepted revenue on the Order Financial Card. Direct material/
  // labor and markup all come from the alternate's own QuoteV3MarkupBreakdown.
  for (const summary of v3Totals.alternates) {
    if (!summary.selected) continue
    const sign = summary.pricingMode === 'deduct' ? -1 : 1
    const b = summary.breakdown
    materialCostBare += sign * b.materialSubtotal
    accessoriesCost += sign * b.accessoriesSubtotal
    hangerCost += sign * b.hangerLaborSubtotal
    finisherCost += sign * b.finisherLaborSubtotal
    componentCost += sign * b.componentLaborSubtotal
    prepCleanCost += sign * b.cleanupTotal
    salesTax += sign * b.salesTaxAmount
    overheadAmount += sign * b.overheadAmount
    profitAmount += sign * b.profitAmount
  }

  const totalLaborCost = hangerCost + finisherCost + componentCost + prepCleanCost
  const totalMaterialCost = materialCostBare + accessoriesCost + salesTax
  const totalDirectCost = totalMaterialCost + totalLaborCost
  const subtotal = totalDirectCost + overheadAmount
  const finalTotal = v3Totals.acceptedTotal

  return {
    ...base,
    version: 2,
    sqft: effectiveSqft > 0 ? String(effectiveSqft) : '',
    wastePercentage: wastePct,
    hangerRate,
    finisherRate,
    prepCleanRate: v3.prep_clean_rate,
    overheadPercentage: v3.overhead_pct,
    profitPercentage: v3.profit_pct,
    salesTaxRate: v3.sales_tax_pct,
    materialRate,
    quoteNumber: v3.quoteNumber,
    outcome: v3.outcome,
    outcomeTimestamps: v3.outcomeTimestamps,
    bidSnapshot: v3.bidSnapshot,
    outcomeReason: v3.outcomeReason,
    scopeOfWork: v3.scope_of_work ?? '',
    hangerIncludeLaborBurden: v3.hanger_include_labor_burden !== false,
    finisherIncludeLaborBurden: v3.finisher_include_labor_burden !== false,
    prepCleanIncludeLaborBurden: v3.prep_clean_include_labor_burden !== false,
    totalQuoteAmount: finalTotal,
    calculations: {
      sqft: effectiveSqft * (1 + wastePct / 100),
      hangerCost,
      finisherCost,
      prepCleanCost,
      materialCost: materialCostBare + accessoriesCost,
      salesTax,
      totalLaborCost,
      totalMaterialCost,
      totalDirectCost,
      overheadAmount,
      profitAmount,
      subtotal,
      subtotalBeforeProfit: subtotal,
      subtotalAfterProfit: finalTotal,
      finalTotal,
      calculatedTotal: finalTotal,
      hangerCostWithTax: hangerCost,
      finisherCostWithTax: finisherCost,
      prepCleanCostWithTax: prepCleanCost,
    },
  }
}

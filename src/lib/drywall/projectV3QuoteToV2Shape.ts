import { createEmptyDrywallQuote } from './createEmptyDrywallQuote'
import {
  getEffectiveFinisherRate,
  getEffectiveHangerRate,
  getLineMaterialRate,
} from './quoteV3CatalogResolve'
import { computeLineItem, computeQuoteV3Totals } from './quoteV3Math'
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
  const laborBurdenOpts = {
    hangerIncludeLaborBurden: v3.hanger_include_labor_burden,
    finisherIncludeLaborBurden: v3.finisher_include_labor_burden,
    prepCleanIncludeLaborBurden: v3.prep_clean_include_labor_burden,
    projectHangerRate: v3.project_hanger_rate,
    projectFinisherRate: v3.project_finisher_rate,
  }
  const drywallComputed = drywallLines.map((line) =>
    computeLineItem(line, catalogs, laborBurdenOpts),
  )
  const materialCostBare = drywallComputed.reduce((sum, c) => sum + c.materialTotal, 0)
  const accessoriesCost = drywallComputed.reduce((sum, c) => sum + c.accessoriesTotal, 0)
  const hangerCost = drywallComputed.reduce((sum, c) => sum + c.hangerLaborTotal, 0)
  const finisherCost = drywallComputed.reduce((sum, c) => sum + c.finisherLaborTotal, 0)
  const prepCleanCost = routine.cleanupTotal
  const salesTax = routine.salesTaxAmount
  const totalLaborCost = hangerCost + finisherCost + prepCleanCost
  const totalMaterialCost = materialCostBare + accessoriesCost + salesTax
  const totalDirectCost = totalMaterialCost + totalLaborCost
  const overheadAmount = routine.overheadAmount
  const profitAmount = routine.profitAmount
  const subtotal = totalDirectCost + overheadAmount
  const finalTotal = routine.total

  return {
    ...base,
    version: 2,
    sqft: totalSqft > 0 ? String(totalSqft) : '',
    wastePercentage: wastePct,
    hangerRate,
    finisherRate,
    prepCleanRate: v3.prep_clean_rate,
    overheadPercentage: v3.overhead_pct,
    profitPercentage: v3.profit_pct,
    salesTaxRate: v3.sales_tax_pct,
    materialRate,
    quoteNumber: v3.quoteNumber,
    scopeOfWork: v3.scope_of_work ?? '',
    hangerIncludeLaborBurden: v3.hanger_include_labor_burden !== false,
    finisherIncludeLaborBurden: v3.finisher_include_labor_burden !== false,
    prepCleanIncludeLaborBurden: v3.prep_clean_include_labor_burden !== false,
    totalQuoteAmount: finalTotal,
    calculations: {
      sqft: totalSqft * (1 + wastePct / 100),
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

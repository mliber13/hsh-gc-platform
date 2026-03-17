// ============================================================================
// Pro Forma Deal Summary Service
// ============================================================================
//
// Display-only helper for building an "Attainable Housing Deal Summary"
// from an existing ProFormaProjection and optional deal-level inputs.
//

import { ProFormaProjection, DealSummary, DealSummaryInputs, DealSummaryIncentive } from '@/types/proforma'

export function buildDealSummary(
  projection: ProFormaProjection,
  inputs?: DealSummaryInputs,
): DealSummary | undefined {
  if (!inputs || !inputs.totalUnits || inputs.totalUnits <= 0) {
    return undefined
  }

  const totalUnits = inputs.totalUnits
  const averageUnitSize = inputs.averageUnitSize ?? 0
  const targetSalePricePerUnit = inputs.targetSalePricePerUnit ?? 0
  const marketPricePerSF = inputs.marketPricePerSF

  const baseProjectCost =
    projection.sourcesAndUses?.uses.totalDevelopmentCost ??
    projection.totalEstimatedCost

  if (baseProjectCost <= 0) {
    return undefined
  }

  const baseCostPerUnit = baseProjectCost / totalUnits
  const targetPricePerSF =
    averageUnitSize > 0 && targetSalePricePerUnit > 0
      ? targetSalePricePerUnit / averageUnitSize
      : undefined

  const gapPerUnit = baseCostPerUnit - targetSalePricePerUnit

  const incentives: DealSummaryIncentive[] = []
  let totalIncentivesPerUnit = 0
  let totalIncentives = 0

  for (const row of inputs.incentives ?? []) {
    if (!row.label) continue
    let perUnit = row.perUnitAmount ?? 0
    let total = row.totalAmount ?? 0

    if (perUnit <= 0 && total > 0 && totalUnits > 0) {
      perUnit = total / totalUnits
    } else if (total <= 0 && perUnit > 0 && totalUnits > 0) {
      total = perUnit * totalUnits
    }

    if (perUnit <= 0 && total <= 0) continue

    incentives.push({
      label: row.label,
      perUnitAmount: perUnit,
      totalAmount: total,
    })

    totalIncentivesPerUnit += perUnit
    totalIncentives += total
  }

  const adjustedCostPerUnit = baseCostPerUnit - totalIncentivesPerUnit
  const profitPerUnit = targetSalePricePerUnit - adjustedCostPerUnit
  const totalProfit = profitPerUnit * totalUnits

  const capitalStack: DealSummary['capitalStack'] = []
  const sources = projection.sourcesAndUses?.sources

  if (sources) {
    if (sources.loanAmount > 0) {
      capitalStack.push({
        label: 'Debt / Bond Financing',
        amount: sources.loanAmount,
      })
    }
    if (sources.equityRequired > 0) {
      capitalStack.push({
        label: 'Developer Equity',
        amount: sources.equityRequired,
      })
    }
  }

  if (totalIncentives > 0) {
    capitalStack.push({
      label: 'Grants / Incentives',
      amount: totalIncentives,
    })
  }

  const conclusionText =
    inputs.conclusionText &&
    inputs.conclusionText.trim().length > 0
      ? inputs.conclusionText.trim()
      : undefined

  return {
    totalUnits,
    averageUnitSize,
    targetSalePricePerUnit,
    targetPricePerSF,
    marketPricePerSF,
    baseProjectCost,
    baseCostPerUnit,
    gapPerUnit,
    incentives,
    totalIncentivesPerUnit,
    totalIncentives,
    adjustedCostPerUnit,
    profitPerUnit,
    totalProfit,
    capitalStack,
    publicBenefits: inputs.publicBenefits,
    conclusionText,
  }
}


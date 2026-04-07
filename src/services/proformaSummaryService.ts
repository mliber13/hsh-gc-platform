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

  // Single-source cost basis:
  // - For for-sale LOC, use engine-reported base before incentives when available.
  // - Otherwise fall back to legacy sources.
  const baseProjectCost =
    projection.summary.forSaleBaseCostBeforeIncentives ??
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

  const normalizeApplyTo = (applyTo?: string) =>
    (applyTo || '').trim().toLowerCase().replace(/_/g, '-')

  for (const row of inputs.incentives ?? []) {
    if (!row.label) continue
    const applyTo = normalizeApplyTo(row.applyTo)
    const isFinancingSupport =
      applyTo === 'financing-term' || /\bbond financing\b/i.test(row.label)
    const isCostReducingSupport =
      applyTo === 'infrastructure-reduction' ||
      applyTo === 'cost-reduction' ||
      applyTo === 'project-cost-reduction'
    // Only cost-reducing incentives should reduce adjusted cost/profit math.
    // Equity-source and financing-term are funding support, not cost reductions.
    if (isFinancingSupport || !isCostReducingSupport) continue
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

  // Option 1 capital source treatment:
  // - Debt and Equity are modeled as the two source types.
  // - "Debt service" tagged rows are surfaced in the cap stack for visibility.
  const fundingRows = (inputs.incentives ?? []).filter((row) => {
    const amount = row.totalAmount ?? 0
    if (amount <= 0) return false
    const applyTo = normalizeApplyTo(row.applyTo)
    const sourceType = (row.sourceType || 'equity').toLowerCase()
    return (
      applyTo === 'equity-source' ||
      applyTo === 'debt-service' ||
      sourceType === 'debt' ||
      sourceType === 'equity'
    )
  })

  for (const row of fundingRows) {
    const applyTo = normalizeApplyTo(row.applyTo)
    const sourceType = (row.sourceType || 'equity').toLowerCase()
    const isDebt = sourceType === 'debt'
    const prefix = isDebt ? 'Debt Source' : 'Equity Source'
    const descriptor = row.label?.trim() ? row.label.trim() : 'Unnamed source'
    const suffix = applyTo === 'debt-service' ? ' (Debt Service)' : ''
    capitalStack.push({
      label: `${prefix}: ${descriptor}${suffix}`,
      amount: row.totalAmount ?? 0,
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


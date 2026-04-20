import type { ForSalePhaseInput, ProFormaInput } from '@/types/proforma'

export type WorkspaceReadinessStage = 'coaching' | 'scenario' | 'proforma'

export interface DealReadiness {
  /** 0–100: weighted; critical gaps pull this down faster than nice-to-haves */
  score: number
  /** Every mode-specific critical check passed */
  proformaReady: boolean
  suggestedStage: WorkspaceReadinessStage
  /** Human labels for failed checks (critical first, then by weight) */
  blockers: string[]
  failedCriticalCount: number
}

interface CheckDef {
  id: string
  label: string
  weight: number
  critical: boolean
  pass: boolean
}

function validDate(d: unknown): boolean {
  if (d == null) return false
  const t = d instanceof Date ? d.getTime() : new Date(d as string).getTime()
  return Number.isFinite(t) && !Number.isNaN(t)
}

function totalUses(inp: ProFormaInput): number {
  const hard = inp.underwritingEstimatedConstructionCost || 0
  const land = inp.landCost || 0
  const soft = hard * ((inp.softCostPercent || 0) / 100)
  const contingency = hard * ((inp.contingencyPercent || 0) / 100)
  return hard + land + soft + contingency
}

/** General-development project LTC: LTC > 0 requires sized debt, coupon, and term; LTC 0 = equity-only (no loan). */
function financeOkProjectLtc(inp: ProFormaInput): boolean {
  const ltc = inp.loanToCostPercent || 0
  const debt = inp.debtService?.loanAmount || 0
  const rate = inp.debtService?.interestRate || 0
  const term = inp.debtService?.loanTermMonths || 0
  if (ltc <= 0) {
    return debt <= 0
  }
  return debt > 0 && rate > 0 && term > 0
}

function rentalIncomeViable(inp: ProFormaInput): boolean {
  if (!inp.includeRentalIncome) return true
  const units = inp.rentalUnits || []
  if (units.length === 0) return false
  return units.some((u) => {
    if (u.rentType === 'fixed') return (u.monthlyRent || 0) > 0
    return (u.squareFootage || 0) > 0 && (u.rentPerSqft || 0) > 0
  })
}

function operatingExpensesOk(inp: ProFormaInput): boolean {
  if (!inp.includeOperatingExpenses) return true
  const o = inp.operatingExpenses
  if (!o) return false
  return (
    Number.isFinite(o.propertyManagementPercent ?? 0) &&
    Number.isFinite(o.monthlyPropertyInsurance ?? 0) &&
    Number.isFinite(o.annualPropertyTax ?? 0)
  )
}

function permanentDebtOkIfIncluded(inp: ProFormaInput): boolean {
  if (!inp.includeDebtService) return true
  const ds = inp.debtService
  return (
    (ds?.loanAmount || 0) > 0 &&
    (ds?.interestRate || 0) > 0 &&
    (ds?.loanTermMonths || 0) > 0
  )
}

function phaseWellFormed(
  p: ForSalePhaseInput,
  phaseTimingMode: 'trigger-based' | 'fixed-schedule' = 'trigger-based',
): boolean {
  const triggerOk = phaseTimingMode === 'fixed-schedule' || (p.presaleTriggerPercent || 0) > 0
  return (
    (p.unitCount || 0) > 0 &&
    (p.buildMonths || 0) > 0 &&
    triggerOk &&
    (p.closeStartMonthOffset || 0) >= (p.presaleStartMonthOffset || 0)
  )
}

/**
 * For-sale economics are present in nested fields even when Mode is still "general-development"
 * (common after partial imports). Layer LOC / phase requirements in that case.
 */
export function materialForSaleContext(inp: ProFormaInput): boolean {
  const fs = inp.forSalePhasedLoc
  if (!fs) return false
  if ((fs.totalUnits || 0) > 0) return true
  if ((fs.averageSalePrice || 0) > 0) return true
  if ((fs.fixedLocLimit || 0) > 0) return true
  if ((fs.ltcPercent || 0) > 0) return true
  if ((fs.presaleDepositPercent || 0) > 0) return true
  if ((fs.salesPaceUnitsPerMonth || 0) > 0) return true
  if ((fs.infrastructureCost || 0) > 0) return true
  if ((fs.phases?.length || 0) > 0) return true
  if ((fs.tifInfrastructureReduction || 0) > 0) return true
  if ((fs.incentiveCostReduction || 0) > 0) return true
  if ((fs.incentiveEquitySource || 0) > 0) return true
  const debtRows = ((inp as any).customStacks?.debtLocRows as Array<{ applyTo?: string; amount?: number }>) || []
  if (debtRows.some((r) => r.applyTo === 'loc-limit' && Number(r.amount) > 0)) return true
  const incRows = ((inp as any).customStacks?.incentiveRows as Array<{ label?: string }>) || []
  if (incRows.some((r) => String(r.label || '').trim().length > 0)) return true
  return false
}

/** Canonical incentive $ on forSalePhasedLoc, or labeled stack rows all have positive amounts. */
function incentiveDollarsOk(inp: ProFormaInput): boolean {
  const fs = inp.forSalePhasedLoc
  const canon =
    (fs?.tifInfrastructureReduction || 0) + (fs?.incentiveCostReduction || 0) + (fs?.incentiveEquitySource || 0)
  if (canon > 0) return true
  const rows = ((inp as any).customStacks?.incentiveRows as Array<{ label?: string; amount?: number }>) || []
  const labeled = rows.filter((r) => String(r.label || '').trim().length > 0)
  if (labeled.length === 0) return true
  return labeled.every((r) => Number(r.amount) > 0)
}

function hasLabeledIncentiveRows(inp: ProFormaInput): boolean {
  const rows = ((inp as any).customStacks?.incentiveRows as Array<{ label?: string }>) || []
  return rows.some((r) => String(r.label || '').trim().length > 0)
}

function finalize(checks: CheckDef[]): DealReadiness {
  const totalW = checks.reduce((s, c) => s + c.weight, 0)
  const passedW = checks.filter((c) => c.pass).reduce((s, c) => s + c.weight, 0)
  const score = totalW > 0 ? Math.round((passedW / totalW) * 100) : 0
  const failedCritical = checks.filter((c) => c.critical && !c.pass)
  const proformaReady = failedCritical.length === 0

  const blockers = checks
    .filter((c) => !c.pass)
    .sort((a, b) => {
      if (a.critical !== b.critical) return a.critical ? -1 : 1
      return b.weight - a.weight
    })
    .map((c) => c.label)

  const suggestedStage: WorkspaceReadinessStage = proformaReady
    ? 'proforma'
    : score >= 36
      ? 'scenario'
      : 'coaching'

  return {
    score,
    proformaReady,
    suggestedStage,
    blockers,
    failedCriticalCount: failedCritical.length,
  }
}

/** Contract, timeline, and hard cost — shared by dev + for-sale underwriting. */
function dealTimelineAndValueChecks(inp: ProFormaInput): CheckDef[] {
  return [
    {
      id: 'contract',
      label: 'Contract / gross value',
      weight: 12,
      critical: true,
      pass: (inp.contractValue || 0) > 0,
    },
    {
      id: 'horizon',
      label: 'Projection horizon (months)',
      weight: 10,
      critical: true,
      pass: (inp.projectionMonths || 0) >= 1,
    },
    {
      id: 'start',
      label: 'Start date',
      weight: 10,
      critical: true,
      pass: validDate(inp.startDate),
    },
    {
      id: 'hard',
      label: 'Est. construction (hard cost)',
      weight: 12,
      critical: true,
      pass: (inp.underwritingEstimatedConstructionCost || 0) > 0,
    },
  ]
}

/** Uses basis + project LTC / construction debt — shared. */
function underwritingUsesAndProjectFinancingChecks(inp: ProFormaInput): CheckDef[] {
  const tu = totalUses(inp)
  return [
    {
      id: 'uses',
      label: 'Total uses (hard + land + soft + contingency)',
      weight: 10,
      critical: true,
      pass: tu > 0,
    },
    {
      id: 'soft',
      label: 'Soft cost % (> 0)',
      weight: 10,
      critical: true,
      pass: (inp.softCostPercent || 0) > 0,
    },
    {
      id: 'cont',
      label: 'Contingency % (> 0)',
      weight: 10,
      critical: true,
      pass: (inp.contingencyPercent || 0) > 0,
    },
    {
      id: 'financing',
      label: 'Project financing: LTC, debt amount, interest rate %, term (or 0% LTC equity-only)',
      weight: 14,
      critical: true,
      pass: financeOkProjectLtc(inp),
    },
  ]
}

/** Exit / refinance / tax — required for full underwriting (engine uses these in extended paths). */
function exitWaterfallTaxChecks(inp: ProFormaInput): CheckDef[] {
  const rentalMode = (inp.proFormaMode || 'general-development') === 'rental-hold'
  return [
    {
      id: 'exitCap',
      label: 'Exit cap rate %',
      weight: 10,
      critical: rentalMode,
      pass: !rentalMode || (inp.exitCapRate || 0) > 0,
    },
    {
      id: 'refiLtv',
      label: 'Refinance LTV %',
      weight: 10,
      critical: rentalMode,
      pass: !rentalMode || (inp.refinanceLTVPercent || 0) > 0,
    },
    {
      id: 'tax',
      label: 'Tax rate %',
      weight: 8,
      critical: rentalMode,
      pass: !rentalMode || (inp.taxRatePercent || 0) > 0,
    },
  ]
}

function generalDevelopmentSecondaryChecks(inp: ProFormaInput): CheckDef[] {
  return [
    {
      id: 'constructionMonths',
      label: 'Construction duration (months)',
      weight: 6,
      critical: false,
      pass: (inp.constructionMonths || 0) > 0,
    },
    {
      id: 'sf',
      label: 'Total project SF',
      weight: 4,
      critical: false,
      pass: (inp.totalProjectSquareFootage || 0) > 0,
    },
  ]
}

/** For-sale phased LOC model (no duplicate timeline/hard — use with dealTimeline + underwriting). */
function forSaleLocModelChecks(inp: ProFormaInput): CheckDef[] {
  const fs = inp.forSalePhasedLoc
  const phases = fs?.phases || []
  const phaseTimingMode = fs?.phaseTimingMode || 'trigger-based'
  const buckets = fs?.salesAllocationBuckets
  const allocSum =
    (buckets?.locPaydownPercent || 0) +
    (buckets?.reinvestPercent || 0) +
    (buckets?.reservePercent || 0) +
    (buckets?.distributionPercent || 0)
  const allocOk = allocSum >= 99.9 && allocSum <= 100.1
  const phaseUnits = phases.reduce((s, p) => s + (p.unitCount || 0), 0)
  const totalU = fs?.totalUnits || 0

  return [
    {
      id: 'units',
      label: 'For-sale unit count',
      weight: 10,
      critical: true,
      pass: totalU > 0,
    },
    {
      id: 'asp',
      label: 'Average sale price',
      weight: 10,
      critical: true,
      pass: (fs?.averageSalePrice || 0) > 0,
    },
    {
      id: 'presale',
      label: 'Presale deposit %',
      weight: 8,
      critical: true,
      pass: (fs?.presaleDepositPercent || 0) > 0,
    },
    {
      id: 'locLtc',
      label: 'LOC LTC cap %',
      weight: 10,
      critical: true,
      pass: (fs?.ltcPercent || 0) > 0,
    },
    {
      id: 'locLimit',
      label: 'Fixed LOC limit',
      weight: 12,
      critical: true,
      pass: (fs?.fixedLocLimit || 0) > 0,
    },
    {
      id: 'pace',
      label: 'Sales pace (units/mo)',
      weight: 8,
      critical: true,
      pass: (fs?.salesPaceUnitsPerMonth || 0) > 0,
    },
    {
      id: 'infra',
      label: 'Infrastructure cost',
      weight: 8,
      critical: true,
      pass: (fs?.infrastructureCost || 0) > 0,
    },
    {
      id: 'phases',
      label: 'Phases: at least one row',
      weight: 12,
      critical: true,
      pass: phases.length > 0,
    },
    {
      id: 'phaseDetail',
      label:
        phaseTimingMode === 'fixed-schedule'
          ? 'Each phase: units, start/build timing, and closing timing'
          : 'Each phase: units, build months, presale trigger, closing timing',
      weight: 16,
      critical: true,
      pass: phases.length > 0 && phases.every((p) => phaseWellFormed(p, phaseTimingMode)),
    },
    {
      id: 'alloc',
      label: 'Sales proceeds split = 100%',
      weight: 10,
      critical: true,
      pass: allocOk,
    },
    {
      id: 'incentives',
      label: 'Incentive / TIF / grant dollars (named stack rows need amounts, or enter canonical $)',
      weight: 10,
      critical: hasLabeledIncentiveRows(inp),
      pass: incentiveDollarsOk(inp),
    },
    {
      id: 'phaseUnitsVsTotal',
      label: 'Phase units align with total units',
      weight: 5,
      critical: false,
      pass: phases.length > 0 && totalU > 0 && Math.abs(phaseUnits - totalU) <= 1,
    },
  ]
}

function rentalChecks(inp: ProFormaInput): CheckDef[] {
  return [
    {
      id: 'contract',
      label: 'Contract / value basis',
      weight: 12,
      critical: true,
      pass: (inp.contractValue || 0) > 0,
    },
    {
      id: 'horizon',
      label: 'Projection horizon',
      weight: 10,
      critical: true,
      pass: (inp.projectionMonths || 0) >= 1,
    },
    {
      id: 'start',
      label: 'Start date',
      weight: 10,
      critical: true,
      pass: validDate(inp.startDate),
    },
    {
      id: 'rental',
      label: 'Rental income: units with rent or $/SF',
      weight: 14,
      critical: true,
      pass: rentalIncomeViable(inp),
    },
    {
      id: 'opex',
      label: 'Operating expenses (when enabled)',
      weight: 12,
      critical: true,
      pass: operatingExpensesOk(inp),
    },
    {
      id: 'debt',
      label: 'Debt service terms (when enabled)',
      weight: 14,
      critical: true,
      pass: permanentDebtOkIfIncluded(inp),
    },
    {
      id: 'exitCap',
      label: 'Exit cap rate %',
      weight: 8,
      critical: false,
      pass: (inp.exitCapRate || 0) > 0,
    },
    {
      id: 'refiLtv',
      label: 'Refinance LTV %',
      weight: 8,
      critical: false,
      pass: (inp.refinanceLTVPercent || 0) > 0,
    },
    {
      id: 'tax',
      label: 'Tax rate %',
      weight: 6,
      critical: false,
      pass: (inp.taxRatePercent || 0) > 0,
    },
    {
      id: 'sf',
      label: 'Total project SF',
      weight: 4,
      critical: false,
      pass: (inp.totalProjectSquareFootage || 0) > 0,
    },
  ]
}

export function computeDealReadiness(input: ProFormaInput | null | undefined): DealReadiness {
  if (!input) {
    return {
      score: 0,
      proformaReady: false,
      suggestedStage: 'coaching',
      blockers: ['No model loaded'],
      failedCriticalCount: 1,
    }
  }

  const mode = input.proFormaMode || 'general-development'

  if (mode === 'rental-hold') {
    return finalize(rentalChecks(input))
  }

  // Unified development mode (legacy values: general-development / for-sale-phased-loc)
  const checks: CheckDef[] = [
    ...dealTimelineAndValueChecks(input),
    ...underwritingUsesAndProjectFinancingChecks(input),
    ...generalDevelopmentSecondaryChecks(input),
    ...exitWaterfallTaxChecks(input),
  ]
  if (materialForSaleContext(input)) {
    checks.push(...forSaleLocModelChecks(input))
  }
  return finalize(checks)
}

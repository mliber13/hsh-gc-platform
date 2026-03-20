// ============================================================================
// Pro Forma Service
// ============================================================================
//
// Service for generating construction loan pro forma financial projections
//

import { v4 as uuidv4 } from 'uuid'
import { Project, Trade } from '@/types'
import {
  ProFormaInput,
  ProFormaProjection,
  MonthlyCashFlow,
  PaymentMilestone,
  RentalUnit,
  OperatingExpenses,
  DebtService,
  SourcesAndUses,
  ConstructionDrawRow,
} from '@/types/proforma'

/**
 * Calculate monthly cash flow projection for a construction project
 */
export function calculateProForma(
  project: Project,
  trades: Trade[],
  input: ProFormaInput
): ProFormaProjection {
  // Base construction cost / estimated cost
  let totalEstimatedCost = trades.reduce((sum, trade) => sum + trade.totalCost, 0)

  // Deal underwriting fallback: when there are no trades but an underwriting
  // estimated construction cost has been provided, use that as the cost basis.
  if (totalEstimatedCost === 0 && trades.length === 0 && (input as any).underwritingEstimatedConstructionCost > 0) {
    totalEstimatedCost = (input as any).underwritingEstimatedConstructionCost
  }
  const projectedProfit = input.contractValue - totalEstimatedCost
  const projectedMargin = input.contractValue > 0 
    ? (projectedProfit / input.contractValue) * 100 
    : 0

  // Calculate cost breakdown percentages
  const laborTotal = trades.reduce((sum, t) => sum + (t.laborCost || 0), 0)
  const materialTotal = trades.reduce((sum, t) => sum + (t.materialCost || 0), 0)
  const subTotal = trades.reduce((sum, t) => sum + (t.subcontractorCost || 0), 0)
  
  const hasTrades = trades.length > 0

  const costBreakdown = {
    laborPercent: totalEstimatedCost > 0
      ? (hasTrades ? (laborTotal / totalEstimatedCost) * 100 : 35)
      : 0,
    materialPercent: totalEstimatedCost > 0
      ? (hasTrades ? (materialTotal / totalEstimatedCost) * 100 : 40)
      : 0,
    subcontractorPercent: totalEstimatedCost > 0
      ? (hasTrades ? (subTotal / totalEstimatedCost) * 100 : 25)
      : 0,
    overheadPercent: 0, // Will be calculated after overhead allocation
  }

  // Full development proforma: Sources & Uses and Construction Draw Schedule
  let sourcesAndUses: SourcesAndUses | undefined
  let constructionDrawSchedule: ConstructionDrawRow[] | undefined
  let totalInterestDuringConstruction = 0

  if (input.useDevelopmentProforma) {
    const landCost = input.landCost ?? 0
    const softCostPercent = input.softCostPercent ?? 0
    const contingencyPercent = input.contingencyPercent ?? 0

    // Underwriting mode: no detailed trades and an underwriting all-in dev cost provided.
    const hasTrades = trades.length > 0
    const underwritingTotal =
      !hasTrades && (input as any).underwritingEstimatedConstructionCost > 0
        ? (input as any).underwritingEstimatedConstructionCost as number
        : undefined

    let constructionCost = totalEstimatedCost
    let softCost = 0
    let contingency = 0
    let totalDevelopmentCost = 0

    if (underwritingTotal !== undefined) {
      const totalDevCostInput = underwritingTotal
      const softPct = softCostPercent / 100
      const contPct = contingencyPercent / 100
      const denom = 1 + softPct + contPct

      if (denom > 0) {
        const baseConstruction = (totalDevCostInput - landCost) / denom
        constructionCost = baseConstruction
        softCost = baseConstruction * softPct
        contingency = baseConstruction * contPct
        // Use the provided total as the final total development cost (do not recompute by summing again)
        totalDevelopmentCost = totalDevCostInput
      } else {
        // Degenerate case: treat underwriting total as construction-only
        constructionCost = totalDevCostInput - landCost
        softCost = constructionCost * softPct
        contingency = constructionCost * contPct
        totalDevelopmentCost = landCost + constructionCost + softCost + contingency
      }
    } else {
      // Normal detailed-estimate / trade-based path
      constructionCost = totalEstimatedCost
      softCost = constructionCost * (softCostPercent / 100)
      contingency = constructionCost * (contingencyPercent / 100)
      totalDevelopmentCost = landCost + constructionCost + softCost + contingency
    }

    const loanToCost = input.loanToCostPercent ?? 0
    const loanAmount = totalDevelopmentCost * (loanToCost / 100)
    const equityRequired = totalDevelopmentCost - loanAmount

    sourcesAndUses = {
      uses: { landCost, constructionCost, softCost, contingency, totalDevelopmentCost },
      sources: { loanAmount, equityRequired },
    }

    const start = new Date(input.startDate)
    start.setDate(1)
    const end = input.constructionCompletionDate ? new Date(input.constructionCompletionDate) : new Date(start.getFullYear(), start.getMonth() + Math.ceil(input.projectionMonths * 0.8), 1)
    if (input.constructionCompletionDate) end.setDate(1)
    const monthsDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
    const constructionMonths = input.constructionMonths ?? Math.max(1, monthsDiff)
    const monthlyDraw = constructionMonths > 0 ? constructionCost / constructionMonths : 0
    const startDate = new Date(input.startDate)
    startDate.setDate(1)
    const rate = (input.debtService?.interestRate ?? 0) / 100 / 12
    let loanBalance = 0
    let cumulativeDraw = 0
    constructionDrawSchedule = []
    for (let i = 0; i < constructionMonths; i++) {
      const d = new Date(startDate)
      d.setMonth(startDate.getMonth() + i)
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const monthLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      const draw = i < constructionMonths ? monthlyDraw : 0
      cumulativeDraw += draw
      loanBalance += draw
      const interestAccrued = loanBalance * rate
      totalInterestDuringConstruction += interestAccrued
      constructionDrawSchedule.push({ month: monthKey, monthLabel, draw, cumulativeDraw, loanBalance, interestAccrued })
    }
  }

  // Generate monthly cash flows
  const monthlyCashFlows = generateMonthlyCashFlows(
    input,
    trades,
    totalEstimatedCost,
    costBreakdown,
    sourcesAndUses,
    constructionDrawSchedule
  )

  // Calculate summary metrics
  const totalInflow = monthlyCashFlows.reduce((sum, m) => sum + m.totalInflow, 0)
  const totalOutflow = monthlyCashFlows.reduce((sum, m) => sum + m.totalOutflow, 0)
  const netCashFlow = totalInflow - totalOutflow
  
  const cumulativeBalances = monthlyCashFlows.map(m => m.cumulativeBalance)
  const peakCashNeeded = Math.max(0, ...cumulativeBalances.map(b => -b)) // Negative balances = cash needed
  
  const monthsNegative = monthlyCashFlows.filter(m => m.cumulativeBalance < 0).length

  // Update overhead percentage after allocation
  if (totalEstimatedCost > 0 && input.overheadAllocationMethod !== 'none') {
    const overheadTotal = monthlyCashFlows.reduce((sum, m) => sum + m.overheadAllocation, 0)
    costBreakdown.overheadPercent = (overheadTotal / (totalEstimatedCost + overheadTotal)) * 100
  }

  // Calculate rental summary
  const rentalSummary = calculateRentalSummary(
    input.rentalUnits, 
    input.includeRentalIncome,
    input.totalProjectSquareFootage
  )
  
  // Calculate financial summaries including rental income
  const rentalIncomeTotal = monthlyCashFlows.reduce((sum, m) => sum + m.rentalIncome, 0)
  const operatingExpensesTotal = monthlyCashFlows.reduce((sum, m) => sum + m.operatingExpenses, 0)
  const debtServiceTotal = monthlyCashFlows.reduce((sum, m) => sum + m.debtService, 0)
  
  // Calculate post-construction averages (months with rental income)
  const postConstructionMonths = monthlyCashFlows.filter(m => m.phase === 'post-construction' && m.rentalIncome > 0)
  const avgMonthlyRentalIncome = postConstructionMonths.length > 0
    ? postConstructionMonths.reduce((sum, m) => sum + m.rentalIncome, 0) / postConstructionMonths.length
    : 0
  const avgMonthlyOperatingExpenses = postConstructionMonths.length > 0
    ? postConstructionMonths.reduce((sum, m) => sum + m.operatingExpenses, 0) / postConstructionMonths.length
    : 0
  const avgMonthlyDebtService = postConstructionMonths.length > 0
    ? postConstructionMonths.reduce((sum, m) => sum + m.debtService, 0) / postConstructionMonths.length
    : 0

  const netOperatingIncome = avgMonthlyRentalIncome - avgMonthlyOperatingExpenses
  const cashFlowAfterDebt = netOperatingIncome - avgMonthlyDebtService
  const annualNOI = netOperatingIncome * 12
  const annualCF = cashFlowAfterDebt * 12

  // Refinance / Exit, investor returns, and tax modeling (Phase 2+3)
  let exitValue: number | undefined
  let refinanceLoanAmount: number | undefined
  let cashOutRefinance: number | undefined
  let irr: number | undefined
  let equityMultiple: number | undefined
  let cashOnCashReturn: number | undefined
  let lpIrr: number | undefined
  let lpEquityMultiple: number | undefined
  let lpCashOnCashReturn: number | undefined
  let gpIrr: number | undefined
  let gpEquityMultiple: number | undefined
  let gpCashOnCashReturn: number | undefined
  let afterTaxIrr: number | undefined
  let lpGpAnnual: ProFormaProjection['lpGpAnnual'] | undefined
  let lpGpExit: ProFormaProjection['lpGpExit'] | undefined
  let exitDebtBalance: number | undefined
  let annualDebtSchedule: ProFormaProjection['annualDebtSchedule'] | undefined
  let annualValueSchedule: ProFormaProjection['annualValueSchedule'] | undefined

  // Always build annual debt schedule from debt service inputs, independent of rental/development logic
  if (input.includeDebtService && input.debtService.loanAmount > 0 && input.debtService.interestRate > 0) {
    annualDebtSchedule = buildAnnualDebtSchedule(input.debtService, input.projectionMonths)
  }

  if (sourcesAndUses && input.includeRentalIncome && annualNOI > 0) {
    const exitCapRate = (input.exitCapRate ?? 0) / 100
    if (exitCapRate > 0) {
      exitValue = annualNOI / exitCapRate
    }
    const refinanceLTV = (input.refinanceLTVPercent ?? 0) / 100
    const constructionLoanBalance = sourcesAndUses.sources.loanAmount
    if (exitValue != null && exitValue > 0 && refinanceLTV > 0) {
      refinanceLoanAmount = exitValue * refinanceLTV
      cashOutRefinance = Math.max(0, refinanceLoanAmount - constructionLoanBalance)
    }

    const equity = sourcesAndUses.sources.equityRequired
    if (equity > 0 && (exitValue != null || annualCF !== 0)) {
      // Simple cash-on-cash (annual cash flow / equity) as a percentage
      if (annualCF !== 0) {
        cashOnCashReturn = (annualCF / equity) * 100
      }

      const constructionMonthsCount: number = Array.isArray(constructionDrawSchedule)
        ? constructionDrawSchedule.length
        : 0
      const postMonths = Math.max(0, input.projectionMonths - constructionMonthsCount)
      const nYearsPost = Math.max(1, Math.floor(postMonths / 12))

      // Modeled loan balance at exit based on debt service inputs
      if (input.includeDebtService && input.debtService.loanAmount > 0 && input.debtService.interestRate > 0) {
        const ds = input.debtService
        const r = ds.interestRate / 100 / 12
        const n = ds.loanTermMonths
        const paymentsMade = Math.min(n, Math.max(0, nYearsPost * 12))
        if (ds.paymentType === 'principal-interest' && r > 0 && n > 0 && paymentsMade > 0) {
          const payment =
            ds.loanAmount *
            ((r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1))
          const balance =
            ds.loanAmount * Math.pow(1 + r, paymentsMade) -
            (payment * (Math.pow(1 + r, paymentsMade) - 1)) / r
          exitDebtBalance = Math.max(0, balance)
        } else {
          // Interest-only or unsupported: assume no amortization
          exitDebtBalance = ds.loanAmount
        }
      }

      // Build total equity cash flows:
      // - annual operating cash flow after debt
      // - plus cash-out refinance in refinance year (if any)
      // - plus a separate final exit cash flow based on net equity at exit
      const totalCashFlows: number[] = [-equity]
      const yearlyCashFlows: number[] = []
      for (let y = 1; y <= nYearsPost; y++) {
        const isRefinanceYear = y === 1
        let yearCF = annualCF
        if (isRefinanceYear && cashOutRefinance) {
          yearCF += cashOutRefinance
        }
        yearlyCashFlows.push(yearCF)
        totalCashFlows.push(yearCF)
      }

      let exitNetEquity: number | undefined
      if (exitValue != null) {
        const debtAtExit = exitDebtBalance ?? refinanceLoanAmount ?? 0
        exitNetEquity = exitValue - debtAtExit
        if (exitNetEquity !== 0) {
          totalCashFlows.push(exitNetEquity)
        }
      }

      irr = calculateIRR(totalCashFlows)
      const totalDistributions =
        yearlyCashFlows.reduce((sum, cf) => sum + cf, 0) + (exitNetEquity ?? 0)
      equityMultiple = totalDistributions > 0 ? totalDistributions / equity : undefined

      // --- Tax modeling: after-tax cash flows & IRR (using simple flat tax & depreciation) ---
      const taxRate = (input.taxRatePercent ?? 0) / 100
      const annualDepreciation = input.annualDepreciation ?? 0
      if (taxRate > 0 && annualDepreciation > 0) {
        const afterTaxCashFlows: number[] = [-equity]
        for (let y = 1; y <= nYearsPost; y++) {
          const isRefinanceYear = y === 1
          const preTaxCF = annualCF + (isRefinanceYear && cashOutRefinance ? cashOutRefinance : 0)
          const taxableIncome = Math.max(0, annualNOI - annualDepreciation)
          const tax = taxableIncome * taxRate
          const afterTaxCF = preTaxCF - tax
          afterTaxCashFlows.push(afterTaxCF)
        }
        if (exitValue != null) {
          const debtAtExit = exitDebtBalance ?? refinanceLoanAmount ?? 0
          const exitNetEquity = exitValue - debtAtExit
          if (exitNetEquity !== 0) {
            // Assume exit proceeds are fully taxable in the year of sale
            const taxableIncomeExit = Math.max(0, exitNetEquity)
            const taxExit = taxableIncomeExit * taxRate
            const afterTaxExit = exitNetEquity - taxExit
            afterTaxCashFlows.push(afterTaxExit)
          }
        }
        afterTaxIrr = calculateIRR(afterTaxCashFlows)
      }

      // --- LP-GP waterfall (Phase 3) ---
      const lpEquityPercent = input.lpEquityPercent ?? 50
      const lpPreferredReturnPercent = input.lpPreferredReturnPercent ?? 8
      const lpAbovePrefProfitSharePercent = input.lpAbovePrefProfitSharePercent ?? 70
      const gpAbovePrefProfitSharePercent = 100 - lpAbovePrefProfitSharePercent

      const lpEquity = (equity * lpEquityPercent) / 100
      const gpEquity = equity - lpEquity

      if (lpEquity > 0 && gpEquity >= 0) {
        const lpCashFlows: number[] = [-lpEquity]
        const gpCashFlows: number[] = [-gpEquity]

        const annualRows: NonNullable<ProFormaProjection['lpGpAnnual']> = []
        let cumulative = 0
        let lpCapital = lpEquity
        let lpPrefBalance = 0

        for (let y = 0; y < nYearsPost; y++) {
          const displayYear = y + 1
          const yearCF = yearlyCashFlows[y]

          const lpCapitalStart = lpCapital
          const lpPrefAccrued = lpCapitalStart * (lpPreferredReturnPercent / 100)
          const prefDue = lpPrefBalance + lpPrefAccrued

          const lpPrefPaid = Math.min(yearCF, prefDue)
          const remainingAfterPref = Math.max(0, yearCF - lpPrefPaid)
          lpPrefBalance = prefDue - lpPrefPaid

          const lpCapitalReturned = Math.min(remainingAfterPref, lpCapital)
          lpCapital -= lpCapitalReturned

          const remainingAfterCapital = remainingAfterPref - lpCapitalReturned

          const lpAbovePref = (remainingAfterCapital * lpAbovePrefProfitSharePercent) / 100
          const gpAbovePref = (remainingAfterCapital * gpAbovePrefProfitSharePercent) / 100

          const lpYearCF = lpPrefPaid + lpCapitalReturned + lpAbovePref
          const gpYearCF = gpAbovePref
          const totalYear = lpYearCF + gpYearCF
          cumulative += totalYear

          lpCashFlows.push(lpYearCF)
          gpCashFlows.push(gpYearCF)

          annualRows.push({
            year: displayYear,
            lpCapitalStart,
            lpCapitalReturned,
            lpCapitalEnd: lpCapital,
            lpPrefAccrued,
            lpPrefPaid,
            lpPrefBalanceEnd: lpPrefBalance,
            remainingAfterPref,
            lpShare: lpYearCF,
            gpShare: gpYearCF,
            totalDistributed: cumulative,
          })
        }

        lpGpAnnual = annualRows

        if (exitValue != null && exitDebtBalance != null) {
          const netEquity = exitValue - exitDebtBalance

          // Exit waterfall:
          // 1) pay unpaid LP pref balance
          // 2) return remaining LP capital
          // 3) split remaining profit by promote shares
          const unpaidPrefAtExit = lpPrefBalance
          let remainingPool = netEquity

          const prefPaidAtExit = Math.min(remainingPool, unpaidPrefAtExit)
          remainingPool -= prefPaidAtExit

          const capitalRemainingAtExit = lpCapital
          const capitalReturnedAtExit = Math.min(remainingPool, capitalRemainingAtExit)
          remainingPool -= capitalReturnedAtExit

          const remainingProfitAfterPrefAndCapital = Math.max(0, remainingPool)

          const lpProfitShare = (remainingProfitAfterPrefAndCapital * lpAbovePrefProfitSharePercent) / 100
          const gpProfitShare = remainingProfitAfterPrefAndCapital - lpProfitShare

          const cashToLp = prefPaidAtExit + capitalReturnedAtExit + lpProfitShare
          const cashToGp = gpProfitShare

          lpGpExit = {
            exitYear: nYearsPost,
            projectedValue: exitValue,
            loanBalance: exitDebtBalance,
            netEquity,
            unpaidPrefAtExit,
            capitalReturnedAtExit,
            remainingProfitAfterPrefAndCapital,
            cashToLp,
            cashToGp,
          }
        }

        // Include exit distributions in LP/GP cash flows
        if (lpGpExit) {
          lpCashFlows.push(lpGpExit.cashToLp)
          gpCashFlows.push(lpGpExit.cashToGp)
        }

        lpIrr = calculateIRR(lpCashFlows)
        gpIrr = calculateIRR(gpCashFlows)

        const lpTotalDistributions = lpCashFlows.slice(1).reduce((sum, cf) => sum + cf, 0)
        const gpTotalDistributions = gpCashFlows.slice(1).reduce((sum, cf) => sum + cf, 0)

        lpEquityMultiple = lpTotalDistributions > 0 ? lpTotalDistributions / lpEquity : undefined
        gpEquityMultiple = gpTotalDistributions > 0 ? gpTotalDistributions / gpEquity : undefined

        const lpYear1 = lpCashFlows[1] ?? 0
        const gpYear1 = gpCashFlows[1] ?? 0
        lpCashOnCashReturn = lpEquity > 0 ? (lpYear1 / lpEquity) * 100 : undefined
        gpCashOnCashReturn = gpEquity > 0 ? (gpYear1 / gpEquity) * 100 : undefined
      }
    }
  }

  // Build annual value schedule for display in Annual Proforma (optional appreciation)
  if (exitValue != null) {
    const equity = sourcesAndUses?.sources.equityRequired ?? 0
    if (equity > 0) {
      const constructionMonthsCount: number = Array.isArray(constructionDrawSchedule)
        ? constructionDrawSchedule.length
        : 0
      const postMonths = Math.max(0, input.projectionMonths - constructionMonthsCount)
      const nYearsPost = Math.max(1, Math.floor(postMonths / 12))

      const appreciationRate = (input.annualAppreciationPercent ?? 0) / 100
      const rows: NonNullable<ProFormaProjection['annualValueSchedule']> = []

      for (let y = 1; y <= nYearsPost; y++) {
        // When appreciation is 0, keep values flat at exitValue (current behavior).
        // When appreciation > 0, anchor terminal year at exitValue and back-solve earlier years
        // so that values grow toward exit (more intuitive for proformas).
        let valueForYear = exitValue
        if (appreciationRate > 0 && nYearsPost > 1) {
          const periodsFromExit = nYearsPost - y
          valueForYear = exitValue / Math.pow(1 + appreciationRate, periodsFromExit)
        }

        rows.push({
          year: y,
          value: valueForYear,
        })
      }

      annualValueSchedule = rows
    }
  }

  const summary: any = {
    totalInflow,
    totalOutflow,
    netCashFlow,
    peakCashNeeded,
    monthsNegative,
    totalInterestDuringConstruction: sourcesAndUses ? totalInterestDuringConstruction : undefined,
    totalRentalIncome: rentalIncomeTotal,
    annualRentalIncome: avgMonthlyRentalIncome * 12,
    monthlyRentalIncome: avgMonthlyRentalIncome,
    totalOperatingExpenses: operatingExpensesTotal,
    annualOperatingExpenses: avgMonthlyOperatingExpenses * 12,
    totalDebtService: debtServiceTotal,
    monthlyDebtService: avgMonthlyDebtService,
    netOperatingIncome: annualNOI,
    cashFlowAfterDebt: annualCF,
    exitValue,
    refinanceLoanAmount,
    cashOutRefinance,
    irr,
    equityMultiple,
    afterTaxIrr,
    lpIrr,
    lpEquityMultiple,
    lpCashOnCashReturn,
    gpIrr,
    gpEquityMultiple,
    gpCashOnCashReturn,
    cashOnCashReturn,
  }

  // Attach simple underwriting debt export metadata (display-only)
  if (input.includeDebtService && input.debtService) {
    summary.interestRate = input.debtService.interestRate
    summary.loanTermMonths = input.debtService.loanTermMonths
  }

  return {
    projectId: project.id,
    projectName: project.name,
    contractValue: input.contractValue,
    totalEstimatedCost,
    projectedProfit,
    projectedMargin,
    monthlyCashFlows,
    summary,
    costBreakdown,
    rentalSummary,
    sourcesAndUses,
    constructionDrawSchedule,
    lpGpAnnual,
    lpGpExit,
    annualDebtSchedule,
    annualValueSchedule,
  }
}

function buildAnnualDebtSchedule(
  debtService: DebtService,
  projectionMonths: number,
): NonNullable<ProFormaProjection['annualDebtSchedule']> {
  if (
    debtService.loanAmount <= 0 ||
    debtService.interestRate <= 0
  ) {
    return []
  }

  const ds = debtService
  const r = ds.interestRate / 100 / 12
  const n = ds.loanTermMonths
  const totalYears = Math.ceil(projectionMonths / 12)
  const loanYears = Math.ceil(n / 12)
  const years = Math.min(totalYears, loanYears)

  let payment = 0
  if (ds.paymentType === 'principal-interest' && r > 0 && n > 0) {
    payment = ds.loanAmount * ((r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1))
  } else if (ds.paymentType === 'interest-only') {
    payment = ds.loanAmount * r
  }

  const rows: NonNullable<ProFormaProjection['annualDebtSchedule']> = []
  let balance = ds.loanAmount

  for (let y = 1; y <= years; y++) {
    const beginningBalance = balance
    let totalPayment = 0
    let totalInterest = 0
    let totalPrincipal = 0

    for (let m = 0; m < 12 && (y - 1) * 12 + m < n; m++) {
      const interest = balance * r
      let thisPayment = payment
      if (ds.paymentType === 'interest-only') {
        thisPayment = interest
      }
      const principal = Math.max(0, thisPayment - interest)
      balance = Math.max(0, balance - principal)

      totalPayment += thisPayment
      totalInterest += interest
      totalPrincipal += principal
    }

    rows.push({
      year: y,
      beginningBalance,
      payment: totalPayment,
      interestPaid: totalInterest,
      principalPaid: totalPrincipal,
      endingBalance: balance,
    })

    if (balance <= 0) break
  }

  return rows
}

/**
 * Calculate IRR from a series of cash flows (period 0 = initial investment, typically negative).
 * Uses Newton-Raphson to find r where NPV(r) = 0.
 */
function calculateIRR(cashFlows: number[], guess = 0.1, maxIter = 50): number | undefined {
  if (cashFlows.length < 2) return undefined
  let r = guess
  for (let iter = 0; iter < maxIter; iter++) {
    let npv = 0
    let npvDeriv = 0
    for (let t = 0; t < cashFlows.length; t++) {
      const factor = Math.pow(1 + r, t)
      npv += cashFlows[t] / factor
      if (t > 0) npvDeriv -= (t * cashFlows[t]) / Math.pow(1 + r, t + 1)
    }
    if (Math.abs(npv) < 1e-7) return r * 100 // Return as percentage
    if (Math.abs(npvDeriv) < 1e-10) break
    r = r - npv / npvDeriv
    if (r <= -1 || r > 10) break // Unstable
  }
  return undefined
}

/**
 * Calculate rental summary statistics
 */
function calculateRentalSummary(
  rentalUnits: RentalUnit[], 
  includeRentalIncome: boolean,
  totalProjectSquareFootage?: number
): ProFormaProjection['rentalSummary'] {
  if (!includeRentalIncome || rentalUnits.length === 0) {
    return {
      totalUnits: 0,
      totalSquareFootage: 0,
      totalProjectSquareFootage: totalProjectSquareFootage || 0,
      averageRentPerUnit: 0,
      averageRentPerSqft: 0,
      stabilizedOccupancy: 0,
    }
  }

  const totalUnits = rentalUnits.length

  // For lease-term modeled units, keep summary based on one physical unit
  // and use the latest configured term as a stabilized representative.
  const pickRepresentativeTerm = (unit: RentalUnit) => {
    if (!Array.isArray(unit.leaseTerms) || unit.leaseTerms.length === 0) return undefined
    return [...unit.leaseTerms].sort((a, b) => {
      const aTime = a.startDate ? new Date(a.startDate).getTime() : 0
      const bTime = b.startDate ? new Date(b.startDate).getTime() : 0
      return bTime - aTime
    })[0]
  }

  const totalSquareFootage = rentalUnits.reduce((sum, unit) => {
    const term = pickRepresentativeTerm(unit)
    return sum + (unit.squareFootage || term?.squareFootage || 0)
  }, 0)
  
  // Calculate monthly rent for each unit
  const monthlyRents = rentalUnits.map(unit => {
    const term = pickRepresentativeTerm(unit)
    const rentType = term?.rentType || unit.rentType
    const occupancyRate = (term?.occupancyRate ?? unit.occupancyRate) / 100
    if (rentType === 'fixed') {
      const monthlyRent = term?.monthlyRent ?? unit.monthlyRent ?? 0
      return monthlyRent * occupancyRate
    } else {
      // Per sqft
      const sqft = unit.squareFootage || term?.squareFootage || 0
      const rentPerSqft = term?.rentPerSqft ?? unit.rentPerSqft ?? 0
      return sqft * rentPerSqft * occupancyRate
    }
  })
  
  const totalMonthlyRent = monthlyRents.reduce((sum, rent) => sum + rent, 0)
  const averageRentPerUnit = totalUnits > 0 ? totalMonthlyRent / totalUnits : 0
  const averageRentPerSqft = totalSquareFootage > 0 
    ? totalMonthlyRent / totalSquareFootage 
    : 0
  
  const averageOccupancy = rentalUnits.length > 0
    ? rentalUnits.reduce((sum, unit) => {
      const term = pickRepresentativeTerm(unit)
      return sum + (term?.occupancyRate ?? unit.occupancyRate)
    }, 0) / rentalUnits.length
    : 0

  return {
    totalUnits,
    totalSquareFootage,
    totalProjectSquareFootage: totalProjectSquareFootage || totalSquareFootage, // Use project sqft if provided, otherwise use rental units sqft
    averageRentPerUnit,
    averageRentPerSqft,
    stabilizedOccupancy: averageOccupancy,
  }
}

/**
 * Generate monthly cash flow breakdown
 */
function generateMonthlyCashFlows(
  input: ProFormaInput,
  trades: Trade[],
  totalEstimatedCost: number,
  costBreakdown: ProFormaProjection['costBreakdown'],
  sourcesAndUses?: SourcesAndUses,
  constructionDrawSchedule?: ConstructionDrawRow[]
): MonthlyCashFlow[] {
  const months: MonthlyCashFlow[] = []
  const startDate = new Date(input.startDate)
  startDate.setDate(1) // Start of month

  // Determine construction completion date
  const constructionEndDate = input.constructionCompletionDate 
    ? new Date(input.constructionCompletionDate)
    : null
  
  // If no explicit completion date, estimate from projection months (assume 80% of projection period is construction)
  const drawScheduleMonths = constructionDrawSchedule?.length ?? 0
  const estimatedConstructionMonths = drawScheduleMonths > 0 ? drawScheduleMonths : Math.ceil(input.projectionMonths * 0.8)
  const defaultConstructionEndDate = new Date(startDate)
  defaultConstructionEndDate.setMonth(startDate.getMonth() + estimatedConstructionMonths)

  const actualConstructionEndDate = constructionEndDate || defaultConstructionEndDate
  actualConstructionEndDate.setDate(1) // Start of month

  // Number of whole calendar months from start (inclusive) to construction end (inclusive)
  const monthsToCompletion =
    (actualConstructionEndDate.getFullYear() - startDate.getFullYear()) * 12 +
    (actualConstructionEndDate.getMonth() - startDate.getMonth()) +
    1

  const constructionMonths = Math.max(1, drawScheduleMonths || monthsToCompletion)
  
  const monthlyCostDistribution = distributeCostsEvenly(
    totalEstimatedCost,
    constructionMonths,
    costBreakdown
  )

  // Build lookup: monthKey -> draw row (for full development proforma)
  const drawByMonth = new Map<string, ConstructionDrawRow>()
  if (constructionDrawSchedule) {
    constructionDrawSchedule.forEach(row => drawByMonth.set(row.month, row))
  }

  // Calculate debt service payment
  const monthlyDebtPayment = calculateDebtService(input.debtService, input.includeDebtService)

  let cumulativeBalance = 0

  // Ensure horizon covers full construction period (including the completion month)
  const totalMonths = Math.max(input.projectionMonths, monthsToCompletion)

  for (let i = 0; i < totalMonths; i++) {
    const currentDate = new Date(startDate)
    currentDate.setMonth(startDate.getMonth() + i)
    
    const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
    const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

    // Determine if we're in construction or post-construction phase
    const isConstructionPhase = currentDate < actualConstructionEndDate
    const phase = isConstructionPhase ? 'construction' : 'post-construction'

    const drawRow = drawByMonth.get(monthKey)
    const constructionDraw = drawRow?.draw ?? 0
    const interestDuringConstruction = drawRow?.interestAccrued ?? 0

    // Calculate milestone payments
    const milestonePayments = input.paymentMilestones
      .filter(m => {
        const milestoneDate = new Date(m.date)
        const milestoneMonth = new Date(milestoneDate.getFullYear(), milestoneDate.getMonth(), 1)
        const currentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
        return milestoneMonth.getTime() === currentMonth.getTime()
      })
      .reduce((sum, m) => sum + m.amount, 0)

    // Calculate rental income (post-construction phase only)
    const rentalIncome = !isConstructionPhase && input.includeRentalIncome
      ? calculateMonthlyRentalIncome(input.rentalUnits, currentDate)
      : 0

    // Calculate construction costs (construction phase only)
    let laborCost = 0
    let materialCost = 0
    let subcontractorCost = 0
    let overheadAllocation = 0

    if (isConstructionPhase) {
      const monthIndex = i < constructionMonths ? i : constructionMonths - 1
      const monthCosts = monthlyCostDistribution[monthIndex] || {
        labor: 0,
        material: 0,
        subcontractor: 0,
      }

      laborCost = monthCosts.labor
      materialCost = monthCosts.material
      subcontractorCost = monthCosts.subcontractor

      if (input.overheadAllocationMethod === 'flat') {
        overheadAllocation = input.monthlyOverhead
      } else if (input.overheadAllocationMethod === 'proportional') {
        const monthlyTotal = monthCosts.labor + monthCosts.material + monthCosts.subcontractor
        if (totalEstimatedCost > 0) {
          overheadAllocation = (monthlyTotal / totalEstimatedCost) * (input.monthlyOverhead * constructionMonths)
        }
      }
    }

    const operatingExpenses = !isConstructionPhase && input.includeOperatingExpenses
      ? calculateMonthlyOperatingExpenses(input.operatingExpenses, rentalIncome)
      : 0

    const debtService = input.includeDebtService &&
      (!isConstructionPhase || input.debtService.paymentType === 'interest-only')
      ? monthlyDebtPayment
      : 0

    // Development-stage cash (construction phase): milestone inflows vs project costs + construction interest
    const developmentInflow = milestonePayments
    const developmentOutflow =
      laborCost +
      materialCost +
      subcontractorCost +
      overheadAllocation +
      interestDuringConstruction
    const developmentCashFlow = developmentInflow - developmentOutflow

    // Operating-stage cash (post-construction): rental income vs operating expenses and debt service
    const operatingCashFlow = rentalIncome - operatingExpenses - debtService

    // Total inflow for reporting: always include milestone funding + rental income
    // (loan draws are not treated as inflow)
    const totalInflow = (milestonePayments || 0) + (rentalIncome || 0)

    // Total outflow for reporting (equivalent to previous totalOutflow, expressed by phase)
    const totalOutflow = isConstructionPhase
      ? developmentOutflow
      : operatingExpenses + debtService
    // Net cash flow and cumulative cash position combine all inflows and outflows
    const netCashFlow = totalInflow - totalOutflow
    cumulativeBalance += netCashFlow

    months.push({
      month: monthKey,
      monthLabel,
      phase,
      milestonePayments,
      rentalIncome,
      ...(constructionDraw > 0 && { constructionDraw }),
      totalInflow,
      laborCost,
      materialCost,
      subcontractorCost,
      overheadAllocation,
      ...(interestDuringConstruction > 0 && { interestDuringConstruction }),
      operatingExpenses,
      debtService,
      totalOutflow,
      netCashFlow,
      cumulativeBalance,
    })
  }

  return months
}

/**
 * Calculate monthly rental income from all units
 */
function calculateMonthlyRentalIncome(rentalUnits: RentalUnit[], currentDate: Date): number {
  let totalIncome = 0

  const isWithinDateWindow = (date: Date, startDate?: Date, endDate?: Date): boolean => {
    if (startDate) {
      const start = new Date(startDate)
      start.setDate(1)
      if (date < start) return false
    }
    if (endDate) {
      const end = new Date(endDate)
      end.setDate(1)
      if (date > end) return false
    }
    return true
  }

  const getMonthlyRent = (
    rentType: 'fixed' | 'perSqft',
    monthlyRent?: number,
    squareFootage?: number,
    rentPerSqft?: number,
  ): number => {
    if (rentType === 'fixed') {
      return monthlyRent || 0
    }
    return (squareFootage || 0) * (rentPerSqft || 0)
  }

  for (const unit of rentalUnits) {
    // Phase A support: if lease terms are provided, evaluate rent by active term(s)
    // while treating this as one physical unit.
    if (Array.isArray(unit.leaseTerms) && unit.leaseTerms.length > 0) {
      for (const term of unit.leaseTerms) {
        const termIsActive = isWithinDateWindow(
          currentDate,
          term.startDate || unit.occupancyStartDate,
          term.endDate || unit.occupancyEndDate,
        )
        if (!termIsActive) continue

        const monthlyRent = getMonthlyRent(
          term.rentType,
          term.monthlyRent ?? unit.monthlyRent,
          term.squareFootage ?? unit.squareFootage,
          term.rentPerSqft ?? unit.rentPerSqft,
        )
        const occupancyRate = (term.occupancyRate ?? unit.occupancyRate) / 100
        totalIncome += monthlyRent * occupancyRate
      }
      continue
    }

    // Check if unit is available for rent (occupancy start date)
    const unitIsActive = isWithinDateWindow(currentDate, unit.occupancyStartDate, unit.occupancyEndDate)
    if (!unitIsActive) continue

    const monthlyRent = getMonthlyRent(
      unit.rentType,
      unit.monthlyRent,
      unit.squareFootage,
      unit.rentPerSqft,
    )

    // Apply occupancy rate
    const effectiveRent = monthlyRent * (unit.occupancyRate / 100)
    totalIncome += effectiveRent
  }

  return totalIncome
}

/**
 * Calculate monthly operating expenses
 */
function calculateMonthlyOperatingExpenses(expenses: OperatingExpenses, rentalIncome: number): number {
  let total = 0

  // Property management (percentage)
  if (expenses.propertyManagementPercent > 0) {
    total += (rentalIncome * expenses.propertyManagementPercent) / 100
  }

  // Cap EX (percentage of rental income)
  if (expenses.capExPercent && expenses.capExPercent > 0) {
    total += (rentalIncome * expenses.capExPercent) / 100
  }

  // Maintenance reserve (percentage of rental income)
  if (expenses.maintenanceReservePercent > 0) {
    total += (rentalIncome * expenses.maintenanceReservePercent) / 100
  }

  // Fixed monthly expenses
  total += expenses.monthlyUtilities || 0
  total += expenses.monthlyOther || 0

  // Annual expenses prorated monthly
  if (expenses.annualExpenses) {
    total += (expenses.annualExpenses.insurance || 0) / 12
    total += (expenses.annualExpenses.propertyTax || 0) / 12
    total += (expenses.annualExpenses.other || 0) / 12
  } else {
    // Fallback to monthly/annual fields
    total += expenses.monthlyPropertyInsurance || 0
    total += (expenses.annualPropertyTax || 0) / 12 // Annual property tax prorated monthly
  }

  return total
}

/**
 * Calculate monthly debt service payment
 */
function calculateDebtService(debt: DebtService, include: boolean): number {
  if (!include || debt.loanAmount === 0) {
    return 0
  }

  if (debt.paymentType === 'interest-only') {
    // Interest-only payment
    const monthlyRate = debt.interestRate / 100 / 12
    return debt.loanAmount * monthlyRate
  } else {
    // Principal + Interest (amortizing loan)
    const monthlyRate = debt.interestRate / 100 / 12
    const numberOfPayments = debt.loanTermMonths
    
    if (monthlyRate === 0) {
      // No interest, just principal
      return debt.loanAmount / numberOfPayments
    }

    // Standard amortization formula
    const payment = debt.loanAmount * 
      (monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments)) /
      (Math.pow(1 + monthlyRate, numberOfPayments) - 1)
    
    return payment
  }
}

/**
 * Distribute total costs evenly across months
 */
function distributeCostsEvenly(
  totalCost: number,
  months: number,
  breakdown: ProFormaProjection['costBreakdown']
): Array<{ labor: number; material: number; subcontractor: number }> {
  const monthlyTotal = totalCost / months
  const distribution: Array<{ labor: number; material: number; subcontractor: number }> = []

  for (let i = 0; i < months; i++) {
    distribution.push({
      labor: (monthlyTotal * breakdown.laborPercent) / 100,
      material: (monthlyTotal * breakdown.materialPercent) / 100,
      subcontractor: (monthlyTotal * breakdown.subcontractorPercent) / 100,
    })
  }

  return distribution
}

/**
 * Generate default milestone schedule based on contract value
 * Common construction loan milestones
 */
export function generateDefaultMilestones(
  contractValue: number,
  startDate: Date,
  months: number
): PaymentMilestone[] {
  const milestones: PaymentMilestone[] = []
  const commonMilestones = [
    { name: 'Project Start', percent: 0, amountPercent: 10 },
    { name: 'Foundation Complete', percent: 15, amountPercent: 15 },
    { name: 'Framing Complete', percent: 30, amountPercent: 20 },
    { name: 'Rough-In Complete', percent: 50, amountPercent: 20 },
    { name: 'Drywall Complete', percent: 70, amountPercent: 15 },
    { name: 'Final Completion', percent: 100, amountPercent: 20 },
  ]

  const endDate = new Date(startDate)
  endDate.setMonth(endDate.getMonth() + months)

  commonMilestones.forEach((milestone, index) => {
    const milestoneDate = new Date(startDate)
    const progressMonths = (milestone.percent / 100) * months
    milestoneDate.setMonth(startDate.getMonth() + Math.floor(progressMonths))

    milestones.push({
      id: uuidv4(),
      name: milestone.name,
      date: milestoneDate,
      amount: (contractValue * milestone.amountPercent) / 100,
      percentComplete: milestone.percent,
    })
  })

  return milestones
}




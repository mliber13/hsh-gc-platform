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
} from '@/types/proforma'

/**
 * Calculate monthly cash flow projection for a construction project
 */
export function calculateProForma(
  project: Project,
  trades: Trade[],
  input: ProFormaInput
): ProFormaProjection {
  const totalEstimatedCost = trades.reduce((sum, trade) => sum + trade.totalCost, 0)
  const projectedProfit = input.contractValue - totalEstimatedCost
  const projectedMargin = input.contractValue > 0 
    ? (projectedProfit / input.contractValue) * 100 
    : 0

  // Calculate cost breakdown percentages
  const laborTotal = trades.reduce((sum, t) => sum + (t.laborCost || 0), 0)
  const materialTotal = trades.reduce((sum, t) => sum + (t.materialCost || 0), 0)
  const subTotal = trades.reduce((sum, t) => sum + (t.subcontractorCost || 0), 0)
  
  const costBreakdown = {
    laborPercent: totalEstimatedCost > 0 ? (laborTotal / totalEstimatedCost) * 100 : 0,
    materialPercent: totalEstimatedCost > 0 ? (materialTotal / totalEstimatedCost) * 100 : 0,
    subcontractorPercent: totalEstimatedCost > 0 ? (subTotal / totalEstimatedCost) * 100 : 0,
    overheadPercent: 0, // Will be calculated after overhead allocation
  }

  // Generate monthly cash flows
  const monthlyCashFlows = generateMonthlyCashFlows(
    input,
    trades,
    totalEstimatedCost,
    costBreakdown
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

  return {
    projectId: project.id,
    projectName: project.name,
    contractValue: input.contractValue,
    totalEstimatedCost,
    projectedProfit,
    projectedMargin,
    monthlyCashFlows,
    summary: {
      totalInflow,
      totalOutflow,
      netCashFlow,
      peakCashNeeded,
      monthsNegative,
      totalRentalIncome: rentalIncomeTotal,
      annualRentalIncome: avgMonthlyRentalIncome * 12,
      monthlyRentalIncome: avgMonthlyRentalIncome,
      totalOperatingExpenses: operatingExpensesTotal,
      annualOperatingExpenses: avgMonthlyOperatingExpenses * 12,
      totalDebtService: debtServiceTotal,
      monthlyDebtService: avgMonthlyDebtService,
      netOperatingIncome: netOperatingIncome * 12, // Annual NOI
      cashFlowAfterDebt: cashFlowAfterDebt * 12, // Annual cash flow
    },
    costBreakdown,
    rentalSummary,
  }
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
  const totalSquareFootage = rentalUnits.reduce((sum, unit) => sum + (unit.squareFootage || 0), 0)
  
  // Calculate monthly rent for each unit
  const monthlyRents = rentalUnits.map(unit => {
    if (unit.rentType === 'fixed') {
      return (unit.monthlyRent || 0) * (unit.occupancyRate / 100)
    } else {
      // Per sqft
      const sqft = unit.squareFootage || 0
      const rentPerSqft = unit.rentPerSqft || 0
      return sqft * rentPerSqft * (unit.occupancyRate / 100)
    }
  })
  
  const totalMonthlyRent = monthlyRents.reduce((sum, rent) => sum + rent, 0)
  const averageRentPerUnit = totalUnits > 0 ? totalMonthlyRent / totalUnits : 0
  const averageRentPerSqft = totalSquareFootage > 0 
    ? totalMonthlyRent / totalSquareFootage 
    : 0
  
  const averageOccupancy = rentalUnits.length > 0
    ? rentalUnits.reduce((sum, unit) => sum + unit.occupancyRate, 0) / rentalUnits.length
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
  costBreakdown: ProFormaProjection['costBreakdown']
): MonthlyCashFlow[] {
  const months: MonthlyCashFlow[] = []
  const startDate = new Date(input.startDate)
  startDate.setDate(1) // Start of month

  // Determine construction completion date
  const constructionEndDate = input.constructionCompletionDate 
    ? new Date(input.constructionCompletionDate)
    : null
  
  // If no explicit completion date, estimate from projection months (assume 80% of projection period is construction)
  const estimatedConstructionMonths = Math.ceil(input.projectionMonths * 0.8)
  const defaultConstructionEndDate = new Date(startDate)
  defaultConstructionEndDate.setMonth(startDate.getMonth() + estimatedConstructionMonths)

  const actualConstructionEndDate = constructionEndDate || defaultConstructionEndDate
  actualConstructionEndDate.setDate(1) // Start of month

  // Distribute costs across construction timeline only
  const constructionMonths = Math.max(1, Math.ceil(
    (actualConstructionEndDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
  ))
  
  const monthlyCostDistribution = distributeCostsEvenly(
    totalEstimatedCost,
    constructionMonths,
    costBreakdown
  )

  // Calculate debt service payment
  const monthlyDebtPayment = calculateDebtService(input.debtService, input.includeDebtService)

  let cumulativeBalance = 0

  for (let i = 0; i < input.projectionMonths; i++) {
    const currentDate = new Date(startDate)
    currentDate.setMonth(startDate.getMonth() + i)
    
    const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
    const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

    // Determine if we're in construction or post-construction phase
    const isConstructionPhase = currentDate < actualConstructionEndDate
    const phase = isConstructionPhase ? 'construction' : 'post-construction'

    // Calculate milestone payments (construction phase only)
    const milestonePayments = isConstructionPhase
      ? input.paymentMilestones
          .filter(m => {
            const milestoneDate = new Date(m.date)
            return milestoneDate.getFullYear() === currentDate.getFullYear() &&
                   milestoneDate.getMonth() === currentDate.getMonth()
          })
          .reduce((sum, m) => sum + m.amount, 0)
      : 0

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

      // Calculate overhead allocation
      if (input.overheadAllocationMethod === 'flat') {
        overheadAllocation = input.monthlyOverhead
      } else if (input.overheadAllocationMethod === 'proportional') {
        const monthlyTotal = monthCosts.labor + monthCosts.material + monthCosts.subcontractor
        if (totalEstimatedCost > 0) {
          overheadAllocation = (monthlyTotal / totalEstimatedCost) * (input.monthlyOverhead * constructionMonths)
        }
      }
    }

    // Calculate operating expenses (post-construction phase only)
    const operatingExpenses = !isConstructionPhase && input.includeOperatingExpenses
      ? calculateMonthlyOperatingExpenses(input.operatingExpenses, rentalIncome)
      : 0

    // Calculate debt service (post-construction phase only, or during construction if specified)
    const debtService = input.includeDebtService && 
      (!isConstructionPhase || input.debtService.paymentType === 'interest-only')
      ? monthlyDebtPayment
      : 0

    const totalInflow = milestonePayments + rentalIncome
    const totalOutflow = laborCost + materialCost + subcontractorCost + overheadAllocation + operatingExpenses + debtService
    const netCashFlow = totalInflow - totalOutflow
    cumulativeBalance += netCashFlow

    months.push({
      month: monthKey,
      monthLabel,
      phase,
      milestonePayments,
      rentalIncome,
      totalInflow,
      laborCost,
      materialCost,
      subcontractorCost,
      overheadAllocation,
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

  for (const unit of rentalUnits) {
    // Check if unit is available for rent (occupancy start date)
    if (unit.occupancyStartDate) {
      const occupancyStart = new Date(unit.occupancyStartDate)
      occupancyStart.setDate(1) // Start of month
      if (currentDate < occupancyStart) {
        continue // Unit not yet available
      }
    }

    let monthlyRent = 0
    
    if (unit.rentType === 'fixed') {
      monthlyRent = unit.monthlyRent || 0
    } else {
      // Per sqft
      const sqft = unit.squareFootage || 0
      const rentPerSqft = unit.rentPerSqft || 0
      monthlyRent = sqft * rentPerSqft
    }

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

  // Property management (percentage or fixed)
  if (expenses.propertyManagementPercent > 0) {
    total += (rentalIncome * expenses.propertyManagementPercent) / 100
  } else if (expenses.propertyManagementFixed) {
    total += expenses.propertyManagementFixed
  }

  // Fixed monthly expenses
  total += expenses.monthlyMaintenanceReserve || 0
  total += expenses.monthlyUtilities || 0
  total += expenses.monthlyOther || 0

  // Annual expenses prorated monthly
  if (expenses.annualExpenses) {
    total += (expenses.annualExpenses.insurance || 0) / 12
    total += (expenses.annualExpenses.propertyTax || 0) / 12
    total += (expenses.annualExpenses.other || 0) / 12
  } else {
    // Fallback to monthly fields
    total += expenses.monthlyPropertyInsurance || 0
    total += expenses.monthlyPropertyTax || 0
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




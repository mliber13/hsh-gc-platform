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
    },
    costBreakdown,
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

  // Distribute costs across timeline
  // Simple approach: distribute evenly across projection period
  // TODO: Could be enhanced to use project schedule if available
  const monthlyCostDistribution = distributeCostsEvenly(
    totalEstimatedCost,
    input.projectionMonths,
    costBreakdown
  )

  let cumulativeBalance = 0

  for (let i = 0; i < input.projectionMonths; i++) {
    const currentDate = new Date(startDate)
    currentDate.setMonth(startDate.getMonth() + i)
    
    const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
    const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

    // Calculate milestone payments for this month
    const milestonePayments = input.paymentMilestones
      .filter(m => {
        const milestoneDate = new Date(m.date)
        return milestoneDate.getFullYear() === currentDate.getFullYear() &&
               milestoneDate.getMonth() === currentDate.getMonth()
      })
      .reduce((sum, m) => sum + m.amount, 0)

    // Get costs for this month
    const monthCosts = monthlyCostDistribution[i] || {
      labor: 0,
      material: 0,
      subcontractor: 0,
    }

    // Calculate overhead allocation
    let overheadAllocation = 0
    if (input.overheadAllocationMethod === 'flat') {
      overheadAllocation = input.monthlyOverhead
    } else if (input.overheadAllocationMethod === 'proportional') {
      // Allocate proportionally based on monthly costs
      const monthlyTotal = monthCosts.labor + monthCosts.material + monthCosts.subcontractor
      if (totalEstimatedCost > 0) {
        overheadAllocation = (monthlyTotal / totalEstimatedCost) * (input.monthlyOverhead * input.projectionMonths)
      }
    }

    const totalOutflow = monthCosts.labor + monthCosts.material + monthCosts.subcontractor + overheadAllocation
    const netCashFlow = milestonePayments - totalOutflow
    cumulativeBalance += netCashFlow

    months.push({
      month: monthKey,
      monthLabel,
      milestonePayments,
      totalInflow: milestonePayments,
      laborCost: monthCosts.labor,
      materialCost: monthCosts.material,
      subcontractorCost: monthCosts.subcontractor,
      overheadAllocation,
      totalOutflow,
      netCashFlow,
      cumulativeBalance,
    })
  }

  return months
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


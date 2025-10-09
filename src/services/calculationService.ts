// ============================================================================
// Calculation Service
// ============================================================================
//
// Centralized calculations for estimates, variance, and analytics
//

import {
  Project,
  Trade,
  LaborEntry,
  MaterialEntry,
  SubcontractorEntry,
  CostSummary,
  ProgressSummary,
} from '@/types'

// ----------------------------------------------------------------------------
// Estimate Calculations
// ----------------------------------------------------------------------------

/**
 * Calculate total cost for a trade
 */
export function calculateTradeTotalCost(
  laborCost: number,
  materialCost: number,
  subcontractorCost: number
): number {
  return laborCost + materialCost + subcontractorCost
}

/**
 * Calculate labor cost from hours and rate
 */
export function calculateLaborCost(hours: number, rate: number): number {
  return hours * rate
}

/**
 * Calculate material cost with waste factor
 */
export function calculateMaterialWithWaste(
  quantity: number,
  unitCost: number,
  wasteFactor: number
): {
  baseAmount: number
  wasteAmount: number
  totalAmount: number
  adjustedQuantity: number
} {
  const baseAmount = quantity * unitCost
  const wasteMultiplier = wasteFactor / 100
  const wasteAmount = baseAmount * wasteMultiplier
  const totalAmount = baseAmount + wasteAmount
  const adjustedQuantity = quantity * (1 + wasteMultiplier)

  return {
    baseAmount,
    wasteAmount,
    totalAmount,
    adjustedQuantity,
  }
}

/**
 * Calculate cost per unit (rate)
 */
export function calculateUnitRate(totalCost: number, quantity: number): number {
  return quantity > 0 ? totalCost / quantity : 0
}

/**
 * Calculate estimate totals with margins
 */
export function calculateEstimateTotals(
  subtotal: number,
  overheadPercent: number,
  profitPercent: number,
  contingencyPercent: number
): {
  subtotal: number
  overhead: number
  profit: number
  contingency: number
  total: number
  margin: number
  marginPercent: number
} {
  const overhead = subtotal * (overheadPercent / 100)
  const profit = subtotal * (profitPercent / 100)
  const contingency = subtotal * (contingencyPercent / 100)
  const total = subtotal + overhead + profit + contingency
  const margin = profit
  const marginPercent = subtotal > 0 ? (profit / total) * 100 : 0

  return {
    subtotal,
    overhead,
    profit,
    contingency,
    total,
    margin,
    marginPercent,
  }
}

// ----------------------------------------------------------------------------
// Variance Calculations
// ----------------------------------------------------------------------------

/**
 * Calculate variance between estimated and actual
 */
export function calculateVariance(estimated: number, actual: number): {
  variance: number
  variancePercent: number
  isOverBudget: boolean
  isUnderBudget: boolean
} {
  const variance = actual - estimated
  const variancePercent = estimated > 0 ? (variance / estimated) * 100 : 0

  return {
    variance,
    variancePercent,
    isOverBudget: variance > 0,
    isUnderBudget: variance < 0,
  }
}

/**
 * Calculate cost variance for a project
 */
export function calculateProjectVariance(
  estimatedCost: number,
  actualCost: number,
  percentComplete: number
): {
  variance: number
  variancePercent: number
  projectedFinalCost: number
  projectedVariance: number
  costToComplete: number
} {
  const variance = actualCost - estimatedCost
  const variancePercent = estimatedCost > 0 ? (variance / estimatedCost) * 100 : 0

  // Project final cost based on current burn rate
  const percentCompleteDecimal = percentComplete / 100
  const projectedFinalCost =
    percentCompleteDecimal > 0
      ? actualCost / percentCompleteDecimal
      : estimatedCost

  const projectedVariance = projectedFinalCost - estimatedCost
  const costToComplete = projectedFinalCost - actualCost

  return {
    variance,
    variancePercent,
    projectedFinalCost,
    projectedVariance,
    costToComplete,
  }
}

/**
 * Calculate trade variance
 */
export function calculateTradeVariance(
  estimatedTrade: Trade,
  actualCost: number
): {
  estimatedCost: number
  actualCost: number
  variance: number
  variancePercent: number
  laborVariance: number
  materialVariance: number
  subcontractorVariance: number
} {
  const estimatedCost = estimatedTrade.totalCost
  const variance = actualCost - estimatedCost
  const variancePercent = estimatedCost > 0 ? (variance / estimatedCost) * 100 : 0

  return {
    estimatedCost,
    actualCost,
    variance,
    variancePercent,
    // These would need actual breakdown by type
    laborVariance: 0,
    materialVariance: 0,
    subcontractorVariance: 0,
  }
}

// ----------------------------------------------------------------------------
// Actuals Calculations
// ----------------------------------------------------------------------------

/**
 * Calculate total actual costs from entries
 */
export function calculateActualCosts(
  laborEntries: LaborEntry[],
  materialEntries: MaterialEntry[],
  subcontractorEntries: SubcontractorEntry[]
): CostSummary {
  const labor = laborEntries.reduce((sum, entry) => sum + entry.totalCost, 0)
  const material = materialEntries.reduce((sum, entry) => sum + entry.totalCost, 0)
  const subcontractor = subcontractorEntries.reduce(
    (sum, entry) => sum + entry.totalPaid,
    0
  )
  const total = labor + material + subcontractor

  return { labor, material, subcontractor, total }
}

/**
 * Calculate crew total for labor entry
 */
export function calculateCrewTotal(
  crew: Array<{ hours: number; rate: number }>
): {
  totalHours: number
  totalCost: number
  blendedRate: number
} {
  const totalHours = crew.reduce((sum, member) => sum + member.hours, 0)
  const totalCost = crew.reduce((sum, member) => sum + member.hours * member.rate, 0)
  const blendedRate = totalHours > 0 ? totalCost / totalHours : 0

  return { totalHours, totalCost, blendedRate }
}

/**
 * Calculate material waste percentage
 */
export function calculateWastePercentage(
  quantityOrdered: number,
  quantityUsed: number,
  quantityWasted: number
): {
  wastePercent: number
  utilizationPercent: number
  wasteAmount: number
} {
  const wastePercent = quantityOrdered > 0 ? (quantityWasted / quantityOrdered) * 100 : 0
  const utilizationPercent =
    quantityOrdered > 0 ? (quantityUsed / quantityOrdered) * 100 : 0
  const wasteAmount = quantityWasted

  return { wastePercent, utilizationPercent, wasteAmount }
}

// ----------------------------------------------------------------------------
// Progress & Schedule Calculations
// ----------------------------------------------------------------------------

/**
 * Calculate project progress summary
 */
export function calculateProgressSummary(
  estimatedCost: number,
  actualCost: number,
  percentComplete: number
): ProgressSummary {
  const percentCompleteDecimal = percentComplete / 100

  // Cost to complete estimate
  const estimatedCostToComplete = estimatedCost * (1 - percentCompleteDecimal)

  // Projected final cost based on current performance
  const projectedFinalCost =
    percentCompleteDecimal > 0 ? actualCost / percentCompleteDecimal : estimatedCost

  const projectedVariance = projectedFinalCost - estimatedCost
  const costToComplete = projectedFinalCost - actualCost

  return {
    percentComplete,
    estimatedCost,
    actualCost,
    costToComplete,
    projectedFinalCost,
    projectedVariance,
  }
}

/**
 * Calculate schedule performance
 */
export function calculateSchedulePerformance(
  startDate: Date,
  estimatedEndDate: Date,
  actualEndDate: Date | null,
  percentComplete: number
): {
  totalDays: number
  daysElapsed: number
  daysRemaining: number
  expectedPercentComplete: number
  scheduleVariance: number
  isAhead: boolean
  isBehind: boolean
  isOnSchedule: boolean
} {
  const now = new Date()
  const totalDays = Math.ceil(
    (estimatedEndDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  )
  const daysElapsed = Math.ceil(
    (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  )
  const daysRemaining = totalDays - daysElapsed

  // Expected percent complete based on time elapsed
  const expectedPercentComplete = totalDays > 0 ? (daysElapsed / totalDays) * 100 : 0

  // Schedule variance (positive = ahead, negative = behind)
  const scheduleVariance = percentComplete - expectedPercentComplete

  const isAhead = scheduleVariance > 5 // More than 5% ahead
  const isBehind = scheduleVariance < -5 // More than 5% behind
  const isOnSchedule = !isAhead && !isBehind

  return {
    totalDays,
    daysElapsed,
    daysRemaining,
    expectedPercentComplete,
    scheduleVariance,
    isAhead,
    isBehind,
    isOnSchedule,
  }
}

// ----------------------------------------------------------------------------
// Profitability Calculations
// ----------------------------------------------------------------------------

/**
 * Calculate profit margin
 */
export function calculateMargin(revenue: number, cost: number): {
  grossProfit: number
  grossMargin: number
  markup: number
} {
  const grossProfit = revenue - cost
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0
  const markup = cost > 0 ? (grossProfit / cost) * 100 : 0

  return { grossProfit, grossMargin, markup }
}

/**
 * Calculate required price for target margin
 */
export function calculatePriceForMargin(cost: number, targetMarginPercent: number): number {
  // Margin = (Price - Cost) / Price
  // Solving for Price: Price = Cost / (1 - Margin)
  const marginDecimal = targetMarginPercent / 100
  return cost / (1 - marginDecimal)
}

/**
 * Calculate required price for target markup
 */
export function calculatePriceForMarkup(cost: number, targetMarkupPercent: number): number {
  // Markup = (Price - Cost) / Cost
  // Solving for Price: Price = Cost * (1 + Markup)
  const markupDecimal = targetMarkupPercent / 100
  return cost * (1 + markupDecimal)
}

// ----------------------------------------------------------------------------
// Productivity Calculations
// ----------------------------------------------------------------------------

/**
 * Calculate labor productivity rate
 */
export function calculateProductivityRate(
  quantityCompleted: number,
  hoursWorked: number,
  unit: string
): {
  unitsPerHour: number
  hoursPerUnit: number
  unit: string
} {
  const unitsPerHour = hoursWorked > 0 ? quantityCompleted / hoursWorked : 0
  const hoursPerUnit = quantityCompleted > 0 ? hoursWorked / quantityCompleted : 0

  return { unitsPerHour, hoursPerUnit, unit }
}

/**
 * Calculate cost per unit from actuals
 */
export function calculateActualCostPerUnit(
  totalCost: number,
  quantityCompleted: number,
  unit: string
): {
  costPerUnit: number
  unit: string
} {
  const costPerUnit = quantityCompleted > 0 ? totalCost / quantityCompleted : 0

  return { costPerUnit, unit }
}

// ----------------------------------------------------------------------------
// Statistical Calculations (for historical rates)
// ----------------------------------------------------------------------------

/**
 * Calculate average from array of numbers
 */
export function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, val) => sum + val, 0) / values.length
}

/**
 * Calculate standard deviation
 */
export function calculateStandardDeviation(values: number[]): number {
  if (values.length === 0) return 0

  const avg = calculateAverage(values)
  const squaredDiffs = values.map(val => Math.pow(val - avg, 2))
  const avgSquaredDiff = calculateAverage(squaredDiffs)

  return Math.sqrt(avgSquaredDiff)
}

/**
 * Calculate min and max
 */
export function calculateRange(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 0 }

  return {
    min: Math.min(...values),
    max: Math.max(...values),
  }
}

/**
 * Calculate confidence level based on sample size
 */
export function determineConfidenceLevel(
  sampleSize: number
): 'high' | 'medium' | 'low' {
  if (sampleSize >= 5) return 'high'
  if (sampleSize >= 2) return 'medium'
  return 'low'
}

// ----------------------------------------------------------------------------
// Formatting Utilities
// ----------------------------------------------------------------------------

/**
 * Round to decimal places
 */
export function roundToDecimals(value: number, decimals: number = 2): number {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals)
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${roundToDecimals(value, decimals)}%`
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}



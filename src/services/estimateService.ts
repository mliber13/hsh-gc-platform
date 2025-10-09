// ============================================================================
// Estimate Service
// ============================================================================
//
// Business logic for estimate and trade operations
//

import { v4 as uuidv4 } from 'uuid'
import {
  Estimate,
  Trade,
  TradeInput,
  TakeoffItem,
  TakeoffInput,
  DEFAULT_VALUES,
  calculateTotalCost,
} from '@/types'
import {
  estimateStorage,
  tradeStorage,
  takeoffStorage,
  projectStorage,
  getTradesForEstimate,
  getTakeoffForEstimate,
} from './storage'

// ----------------------------------------------------------------------------
// Estimate Operations
// ----------------------------------------------------------------------------

/**
 * Update estimate totals based on trades
 */
export function recalculateEstimate(estimateId: string): Estimate | null {
  const estimate = estimateStorage.getById(estimateId)
  if (!estimate) return null

  const trades = getTradesForEstimate(estimateId)
  
  // Calculate subtotal from all trades
  const subtotal = trades.reduce((sum, trade) => sum + trade.totalCost, 0)

  // Apply overhead, profit, contingency
  // Note: These could be percentages or fixed amounts
  // For now, treating as percentages
  const overhead = estimate.overhead
  const profit = estimate.profit
  const contingency = estimate.contingency

  const totalEstimate = subtotal + overhead + profit + contingency

  // Update estimate
  const updated = estimateStorage.update(estimateId, {
    subtotal,
    totalEstimate,
    updatedAt: new Date(),
  })

  // Update project with new estimate totals
  if (updated) {
    const project = projectStorage.find(p => p.estimate.id === estimateId)
    if (project) {
      projectStorage.update(project.id, {
        estimate: updated,
        updatedAt: new Date(),
      })
    }
  }

  return updated
}

/**
 * Update estimate overhead, profit, contingency
 */
export function updateEstimateMargins(
  estimateId: string,
  margins: {
    overhead?: number
    profit?: number
    contingency?: number
  }
): Estimate | null {
  const updated = estimateStorage.update(estimateId, {
    ...margins,
    updatedAt: new Date(),
  })

  // Recalculate totals
  if (updated) {
    return recalculateEstimate(estimateId)
  }

  return null
}

/**
 * Get estimate with all trades and takeoff items
 */
export function getCompleteEstimate(estimateId: string) {
  const estimate = estimateStorage.getById(estimateId)
  if (!estimate) return null

  const trades = getTradesForEstimate(estimateId)
  const takeoffItems = getTakeoffForEstimate(estimateId)

  return {
    ...estimate,
    trades,
    takeoff: takeoffItems,
  }
}

// ----------------------------------------------------------------------------
// Trade Operations
// ----------------------------------------------------------------------------

/**
 * Add trade to estimate
 */
export function addTrade(estimateId: string, input: TradeInput): Trade {
  const tradeId = uuidv4()

  // Calculate total cost
  const totalCost = calculateTotalCost(
    input.laborCost,
    input.materialCost,
    input.subcontractorCost
  )

  const trade: Trade = {
    id: tradeId,
    estimateId,
    category: input.category,
    name: input.name,
    description: input.description,
    quantity: input.quantity,
    unit: input.unit,
    laborCost: input.laborCost,
    laborRate: input.laborRate,
    laborHours: input.laborHours,
    materialCost: input.materialCost,
    materialRate: input.materialRate,
    subcontractorCost: input.subcontractorCost,
    isSubcontracted: input.isSubcontracted,
    wasteFactor: input.wasteFactor || DEFAULT_VALUES.WASTE_FACTOR,
    totalCost,
    sortOrder: 0, // Will be set based on existing trades
    notes: input.notes,
  }

  // Get existing trades to set sort order
  const existingTrades = getTradesForEstimate(estimateId)
  trade.sortOrder = existingTrades.length

  // Save trade
  tradeStorage.create(trade)

  // Recalculate estimate totals
  recalculateEstimate(estimateId)

  return trade
}

/**
 * Update existing trade
 */
export function updateTrade(tradeId: string, updates: Partial<TradeInput>): Trade | null {
  const trade = tradeStorage.getById(tradeId)
  if (!trade) return null

  // Recalculate total if cost fields changed
  let totalCost = trade.totalCost
  if (
    updates.laborCost !== undefined ||
    updates.materialCost !== undefined ||
    updates.subcontractorCost !== undefined
  ) {
    totalCost = calculateTotalCost(
      updates.laborCost ?? trade.laborCost,
      updates.materialCost ?? trade.materialCost,
      updates.subcontractorCost ?? trade.subcontractorCost
    )
  }

  const updated = tradeStorage.update(tradeId, {
    ...updates,
    totalCost,
  })

  // Recalculate estimate totals
  if (updated) {
    recalculateEstimate(updated.estimateId)
  }

  return updated
}

/**
 * Delete trade
 */
export function deleteTrade(tradeId: string): boolean {
  const trade = tradeStorage.getById(tradeId)
  if (!trade) return false

  const estimateId = trade.estimateId
  const deleted = tradeStorage.delete(tradeId)

  if (deleted) {
    // Recalculate estimate totals
    recalculateEstimate(estimateId)
  }

  return deleted
}

/**
 * Reorder trades
 */
export function reorderTrades(estimateId: string, tradeIds: string[]): void {
  tradeIds.forEach((tradeId, index) => {
    tradeStorage.update(tradeId, { sortOrder: index })
  })
}

/**
 * Bulk add trades
 */
export function bulkAddTrades(estimateId: string, inputs: TradeInput[]): Trade[] {
  const trades = inputs.map(input => addTrade(estimateId, input))
  
  // Recalculate once at the end
  recalculateEstimate(estimateId)
  
  return trades
}

// ----------------------------------------------------------------------------
// Takeoff Operations
// ----------------------------------------------------------------------------

/**
 * Add takeoff item
 */
export function addTakeoffItem(estimateId: string, input: TakeoffInput): TakeoffItem {
  const takeoffId = uuidv4()

  const takeoffItem: TakeoffItem = {
    id: takeoffId,
    estimateId,
    name: input.name,
    description: input.description,
    category: input.category,
    length: input.length,
    width: input.width,
    height: input.height,
    area: input.area,
    volume: input.volume,
    count: input.count,
    unit: input.unit,
    drawingReference: input.drawingReference,
    locationOnSite: input.locationOnSite,
    notes: input.notes,
  }

  return takeoffStorage.create(takeoffItem)
}

/**
 * Update takeoff item
 */
export function updateTakeoffItem(
  takeoffId: string,
  updates: Partial<TakeoffInput>
): TakeoffItem | null {
  return takeoffStorage.update(takeoffId, updates)
}

/**
 * Delete takeoff item
 */
export function deleteTakeoffItem(takeoffId: string): boolean {
  return takeoffStorage.delete(takeoffId)
}

/**
 * Calculate area from length and width
 */
export function calculateArea(length: number, width: number): number {
  return length * width
}

/**
 * Calculate volume from length, width, and height
 */
export function calculateVolume(length: number, width: number, height: number): number {
  return length * width * height
}

// ----------------------------------------------------------------------------
// Cost Calculations
// ----------------------------------------------------------------------------

/**
 * Calculate labor cost from hours and rate
 */
export function calculateLaborCost(hours: number, rate: number): number {
  return hours * rate
}

/**
 * Calculate material cost with waste factor
 */
export function calculateMaterialCostWithWaste(
  quantity: number,
  unitCost: number,
  wasteFactor: number
): number {
  const wasteMultiplier = 1 + wasteFactor / 100
  return quantity * unitCost * wasteMultiplier
}

/**
 * Calculate cost per unit (for rates)
 */
export function calculateCostPerUnit(totalCost: number, quantity: number): number {
  return quantity > 0 ? totalCost / quantity : 0
}

// ----------------------------------------------------------------------------
// Historical Rate Suggestions
// ----------------------------------------------------------------------------

/**
 * Get suggested rate based on historical data
 * (This will be implemented in Phase 3 when we have actual historical data)
 */
export function getSuggestedRate(
  tradeCategory: string,
  projectType: string
): {
  rate: number | null
  confidence: 'high' | 'medium' | 'low'
  projectCount: number
} {
  // TODO: Implement historical rate lookup
  // For now, return null to indicate no historical data available
  return {
    rate: null,
    confidence: 'low',
    projectCount: 0,
  }
}

// ----------------------------------------------------------------------------
// Estimate Analysis
// ----------------------------------------------------------------------------

/**
 * Analyze estimate completeness
 */
export function analyzeEstimate(estimateId: string) {
  const estimate = estimateStorage.getById(estimateId)
  if (!estimate) return null

  const trades = getTradesForEstimate(estimateId)
  
  const warnings: string[] = []
  const suggestions: string[] = []

  // Check for missing trades (basic sanity checks)
  if (trades.length === 0) {
    warnings.push('No trades added to estimate')
  }

  // Check if overhead/profit is set
  if (estimate.overhead === 0) {
    warnings.push('No overhead percentage set')
  }

  if (estimate.profit === 0) {
    warnings.push('No profit margin set')
  }

  // Check for incomplete trades
  const incompleteTrades = trades.filter(
    t => t.totalCost === 0 || t.quantity === 0
  )
  if (incompleteTrades.length > 0) {
    warnings.push(`${incompleteTrades.length} trade(s) with zero cost or quantity`)
  }

  // Check for very high waste factors
  const highWasteTrades = trades.filter(t => t.wasteFactor > 20)
  if (highWasteTrades.length > 0) {
    warnings.push(`${highWasteTrades.length} trade(s) with waste factor over 20%`)
  }

  return {
    isComplete: warnings.length === 0,
    warnings,
    suggestions,
    tradeCount: trades.length,
    totalEstimate: estimate.totalEstimate,
  }
}



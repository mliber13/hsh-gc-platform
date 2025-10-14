// ============================================================================
// Actuals Service
// ============================================================================
//
// Business logic for project actuals operations
//

import { v4 as uuidv4 } from 'uuid'
import {
  Project,
  ProjectActuals,
  LaborEntry,
  MaterialEntry,
  SubcontractorEntry,
  TradeCategory,
} from '@/types'
import {
  projectStorage,
  actualsStorage,
  laborStorage,
  materialStorage,
  subcontractorStorage,
  getLaborEntriesForProject,
  getMaterialEntriesForProject,
  getSubcontractorEntriesForProject,
} from './storage'

// ----------------------------------------------------------------------------
// Initialize Actuals
// ----------------------------------------------------------------------------

/**
 * Initialize actuals for a project if they don't exist
 */
export function initializeActuals(projectId: string): ProjectActuals | null {
  const project = projectStorage.getById(projectId)
  if (!project) return null

  // If actuals already exist, return them
  if (project.actuals) {
    return project.actuals
  }

  // Create new actuals
  const actuals: ProjectActuals = {
    id: uuidv4(),
    projectId,
    laborEntries: [],
    materialEntries: [],
    subcontractorEntries: [],
    totalLaborCost: 0,
    totalMaterialCost: 0,
    totalSubcontractorCost: 0,
    totalActualCost: 0,
    variance: 0,
    variancePercentage: 0,
    dailyLogs: [],
    changeOrders: [],
  }

  // Save actuals
  actualsStorage.create(actuals)

  // Update project
  projectStorage.update(projectId, {
    actuals,
    updatedAt: new Date(),
  })

  return actuals
}

// ----------------------------------------------------------------------------
// Labor Entry Operations
// ----------------------------------------------------------------------------

/**
 * Add labor entry to project
 */
export function addLaborEntry(
  projectId: string,
  data: {
    date: Date
    description: string
    totalCost: number
    trade: TradeCategory
    tradeId?: string
    totalHours?: number
    laborRate?: number
  }
): LaborEntry | null {
  // Initialize actuals if needed
  const actuals = initializeActuals(projectId)
  if (!actuals) return null

  const laborEntry: LaborEntry = {
    id: uuidv4(),
    projectId,
    tradeId: data.tradeId,
    date: data.date,
    crew: [], // Can be expanded later
    trade: data.trade,
    description: data.description,
    totalHours: data.totalHours || 0,
    laborRate: data.laborRate || 0,
    totalCost: data.totalCost,
    createdAt: new Date(),
  }

  // Save labor entry
  laborStorage.create(laborEntry)

  // Update project actuals
  recalculateActuals(projectId)

  return laborEntry
}

/**
 * Get all labor entries for a project
 */
export function getProjectLaborEntries(projectId: string): LaborEntry[] {
  return getLaborEntriesForProject(projectId)
}

// ----------------------------------------------------------------------------
// Material Entry Operations
// ----------------------------------------------------------------------------

/**
 * Add material entry to project
 */
export function addMaterialEntry(
  projectId: string,
  data: {
    date: Date
    materialName: string
    totalCost: number
    category: TradeCategory
    tradeId?: string
    vendor?: string
    invoiceNumber?: string
    quantity?: number
    unit?: string
    unitCost?: number
  }
): MaterialEntry | null {
  // Initialize actuals if needed
  const actuals = initializeActuals(projectId)
  if (!actuals) return null

  const materialEntry: MaterialEntry = {
    id: uuidv4(),
    projectId,
    tradeId: data.tradeId,
    date: data.date,
    materialName: data.materialName,
    category: data.category,
    quantity: data.quantity || 0,
    unit: data.unit || 'each' as any,
    unitCost: data.unitCost || 0,
    totalCost: data.totalCost,
    vendor: data.vendor,
    invoiceNumber: data.invoiceNumber,
    createdAt: new Date(),
  }

  // Save material entry
  materialStorage.create(materialEntry)

  // Update project actuals
  recalculateActuals(projectId)

  return materialEntry
}

/**
 * Get all material entries for a project
 */
export function getProjectMaterialEntries(projectId: string): MaterialEntry[] {
  return getMaterialEntriesForProject(projectId)
}

// ----------------------------------------------------------------------------
// Subcontractor Entry Operations
// ----------------------------------------------------------------------------

/**
 * Add subcontractor entry to project
 */
export function addSubcontractorEntry(
  projectId: string,
  data: {
    subcontractorName: string
    scopeOfWork: string
    contractAmount: number
    totalPaid: number
    trade: TradeCategory
    tradeId?: string
    company?: string
    email?: string
    phone?: string
  }
): SubcontractorEntry | null {
  // Initialize actuals if needed
  const actuals = initializeActuals(projectId)
  if (!actuals) return null

  const subEntry: SubcontractorEntry = {
    id: uuidv4(),
    projectId,
    tradeId: data.tradeId,
    subcontractor: {
      name: data.subcontractorName,
      company: data.company || data.subcontractorName,
      email: data.email,
      phone: data.phone,
    },
    trade: data.trade,
    scopeOfWork: data.scopeOfWork,
    contractAmount: data.contractAmount,
    payments: [],
    totalPaid: data.totalPaid,
    balance: data.contractAmount - data.totalPaid,
    createdAt: new Date(),
  }

  // Save subcontractor entry
  subcontractorStorage.create(subEntry)

  // Update project actuals
  recalculateActuals(projectId)

  return subEntry
}

/**
 * Get all subcontractor entries for a project
 */
export function getProjectSubcontractorEntries(projectId: string): SubcontractorEntry[] {
  return getSubcontractorEntriesForProject(projectId)
}

// ----------------------------------------------------------------------------
// Recalculate Actuals
// ----------------------------------------------------------------------------

/**
 * Recalculate project actuals totals
 */
export function recalculateActuals(projectId: string): ProjectActuals | null {
  const project = projectStorage.getById(projectId)
  if (!project || !project.actuals) return null

  // Get all entries
  const laborEntries = getLaborEntriesForProject(projectId)
  const materialEntries = getMaterialEntriesForProject(projectId)
  const subcontractorEntries = getSubcontractorEntriesForProject(projectId)

  // Calculate totals
  const totalLaborCost = laborEntries.reduce((sum, entry) => sum + entry.totalCost, 0)
  const totalMaterialCost = materialEntries.reduce((sum, entry) => sum + entry.totalCost, 0)
  const totalSubcontractorCost = subcontractorEntries.reduce((sum, entry) => sum + entry.totalPaid, 0)
  const totalActualCost = totalLaborCost + totalMaterialCost + totalSubcontractorCost

  // Calculate variance (if estimate exists)
  const estimatedCost = project.estimate?.totalEstimate || 0
  const variance = totalActualCost - estimatedCost
  const variancePercentage = estimatedCost > 0 ? (variance / estimatedCost) * 100 : 0

  // Update actuals
  const updatedActuals: ProjectActuals = {
    ...project.actuals,
    laborEntries,
    materialEntries,
    subcontractorEntries,
    totalLaborCost,
    totalMaterialCost,
    totalSubcontractorCost,
    totalActualCost,
    variance,
    variancePercentage,
  }

  // Save updated actuals
  actualsStorage.update(project.actuals.id, updatedActuals)

  // Update project
  projectStorage.update(projectId, {
    actuals: updatedActuals,
    updatedAt: new Date(),
  })

  return updatedActuals
}

/**
 * Get project actuals with all entries
 */
export function getProjectActuals(projectId: string): ProjectActuals | null {
  const project = projectStorage.getById(projectId)
  if (!project) return null

  if (!project.actuals) {
    return initializeActuals(projectId)
  }

  // Make sure we have the latest entries
  return recalculateActuals(projectId)
}


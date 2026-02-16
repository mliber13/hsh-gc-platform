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

/**
 * Update labor entry
 */
export function updateLaborEntry(
  entryId: string,
  updates: Partial<{
    date: Date
    description: string
    totalCost: number
    totalHours: number
    laborRate: number
  }>
): LaborEntry | null {
  const entry = laborStorage.getById(entryId)
  if (!entry) return null

  const updated = laborStorage.update(entryId, updates)
  
  if (updated) {
    recalculateActuals(entry.projectId)
  }
  
  return updated
}

/**
 * Delete labor entry
 */
export function deleteLaborEntry(entryId: string): boolean {
  const entry = laborStorage.getById(entryId)
  if (!entry) return false

  const projectId = entry.projectId
  const deleted = laborStorage.delete(entryId)
  
  if (deleted) {
    recalculateActuals(projectId)
  }
  
  return deleted
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

/**
 * Update material entry
 */
export function updateMaterialEntry(
  entryId: string,
  updates: Partial<{
    date: Date
    materialName: string
    totalCost: number
    vendor: string
    invoiceNumber: string
    quantity: number
    unitCost: number
    category: TradeCategory
    tradeId: string
    group: string
  }>
): MaterialEntry | null {
  const entry = materialStorage.getById(entryId)
  if (!entry) return null

  const normalizedUpdates: any = { ...updates }
  if (updates.materialName !== undefined) normalizedUpdates.materialName = updates.materialName
  if (updates.totalCost !== undefined) normalizedUpdates.totalCost = updates.totalCost
  if (updates.vendor !== undefined) normalizedUpdates.vendor = updates.vendor
  if (updates.invoiceNumber !== undefined) normalizedUpdates.invoiceNumber = updates.invoiceNumber
  if (updates.category !== undefined) normalizedUpdates.category = updates.category
  if (updates.tradeId !== undefined) normalizedUpdates.tradeId = updates.tradeId
  if (updates.group !== undefined) normalizedUpdates.group = updates.group

  const updated = materialStorage.update(entryId, normalizedUpdates)
  
  if (updated) {
    recalculateActuals(entry.projectId)
  }
  
  return updated
}

/**
 * Delete material entry
 */
export function deleteMaterialEntry(entryId: string): boolean {
  const entry = materialStorage.getById(entryId)
  if (!entry) return false

  const projectId = entry.projectId
  const deleted = materialStorage.delete(entryId)
  
  if (deleted) {
    recalculateActuals(projectId)
  }
  
  return deleted
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

/**
 * Update subcontractor entry
 */
export function updateSubcontractorEntry(
  entryId: string,
  updates: Partial<{
    subcontractorName: string
    scopeOfWork: string
    contractAmount: number
    totalPaid: number
    company: string
  }>
): SubcontractorEntry | null {
  const entry = subcontractorStorage.getById(entryId)
  if (!entry) return null

  // Update subcontractor info if name or company changed
  const updateData: any = { ...updates }
  if (updates.subcontractorName || updates.company) {
    updateData.subcontractor = {
      ...entry.subcontractor,
      name: updates.subcontractorName || entry.subcontractor.name,
      company: updates.company || entry.subcontractor.company,
    }
  }

  // Recalculate balance if amounts changed
  if (updates.contractAmount !== undefined || updates.totalPaid !== undefined) {
    const contractAmount = updates.contractAmount ?? entry.contractAmount
    const totalPaid = updates.totalPaid ?? entry.totalPaid
    updateData.balance = contractAmount - totalPaid
  }

  const updated = subcontractorStorage.update(entryId, updateData)
  
  if (updated) {
    recalculateActuals(entry.projectId)
  }
  
  return updated
}

/**
 * Delete subcontractor entry
 */
export function deleteSubcontractorEntry(entryId: string): boolean {
  const entry = subcontractorStorage.getById(entryId)
  if (!entry) return false

  const projectId = entry.projectId
  const deleted = subcontractorStorage.delete(entryId)
  
  if (deleted) {
    recalculateActuals(projectId)
  }
  
  return deleted
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


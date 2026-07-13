/**
 * Hybrid Actuals Service
 * Routes actuals operations to either localStorage or Supabase based on online mode
 * Includes automatic QuickBooks sync when connected
 */

import { isOnlineMode, supabase } from '@/lib/supabase'
import type { ProjectActuals } from '@/types'
import { createQBCheck, isQBConnected } from './quickbooksService'
import {
  addLaborEntry as addLaborEntryLS,
  updateLaborEntry as updateLaborEntryLS,
  deleteLaborEntry as deleteLaborEntryLS,
  addMaterialEntry as addMaterialEntryLS,
  updateMaterialEntry as updateMaterialEntryLS,
  deleteMaterialEntry as deleteMaterialEntryLS,
  addSubcontractorEntry as addSubcontractorEntryLS,
  updateSubcontractorEntry as updateSubcontractorEntryLS,
  deleteSubcontractorEntry as deleteSubcontractorEntryLS,
  getProjectActuals as getProjectActualsLS,
} from './actualsService'
import {
  createLaborEntryInDB,
  updateLaborEntryInDB,
  deleteLaborEntryFromDB,
  createMaterialEntryInDB,
  updateMaterialEntryInDB,
  deleteMaterialEntryFromDB,
  createSubcontractorEntryInDB,
  updateSubcontractorEntryInDB,
  deleteSubcontractorEntryFromDB,
  reassignMaterialEntryToProject as reassignMaterialEntryToProjectDB,
  reassignSubcontractorEntryToProject as reassignSubcontractorEntryToProjectDB,
  fetchLaborEntries,
  fetchMaterialEntries,
  fetchSubcontractorEntries,
} from './supabaseService'

// ============================================================================
// LABOR ENTRY OPERATIONS
// ============================================================================

export async function addLaborEntry_Hybrid(projectId: string, entry: any): Promise<any | null> {
  if (isOnlineMode()) {
    const created = await createLaborEntryInDB(projectId, entry)
    if (!created) {
      console.warn('Failed to create labor entry in Supabase, falling back to localStorage')
      return addLaborEntryLS(projectId, entry)
    }
    
    // Auto-sync to QuickBooks if connected
    if (await isQBConnected()) {
      syncEntryToQB('labor', created, entry).catch(err => {
        console.error('Background QB sync failed:', err)
      })
    }
    
    return created
  } else {
    return addLaborEntryLS(projectId, entry)
  }
}

export async function updateLaborEntry_Hybrid(entryId: string, updates: any): Promise<any | null> {
  if (isOnlineMode()) {
    const updated = await updateLaborEntryInDB(entryId, updates)
    if (!updated) {
      console.warn('Failed to update labor entry in Supabase, falling back to localStorage')
      return updateLaborEntryLS(entryId, updates)
    }
    return updated
  } else {
    return updateLaborEntryLS(entryId, updates)
  }
}

export async function deleteLaborEntry_Hybrid(entryId: string): Promise<boolean> {
  if (isOnlineMode()) {
    const deleted = await deleteLaborEntryFromDB(entryId)
    if (!deleted) {
      console.warn('Failed to delete labor entry in Supabase, falling back to localStorage')
      return deleteLaborEntryLS(entryId)
    }
    return deleted
  } else {
    return deleteLaborEntryLS(entryId)
  }
}

// ============================================================================
// MATERIAL ENTRY OPERATIONS
// ============================================================================

export async function addMaterialEntry_Hybrid(projectId: string, entry: any): Promise<any | null> {
  if (isOnlineMode()) {
    const created = await createMaterialEntryInDB(projectId, entry)
    if (!created) {
      console.warn('Failed to create material entry in Supabase, falling back to localStorage')
      return addMaterialEntryLS(projectId, entry)
    }
    
    // Auto-sync to QuickBooks if connected (skip when entry was imported from QB)
    if (await isQBConnected() && !entry.qbTransactionId) {
      syncEntryToQB('material', created, entry).catch(err => {
        console.error('Background QB sync failed:', err)
      })
    }
    
    return created
  } else {
    return addMaterialEntryLS(projectId, entry)
  }
}

export async function updateMaterialEntry_Hybrid(entryId: string, updates: any): Promise<any | null> {
  if (isOnlineMode()) {
    const updated = await updateMaterialEntryInDB(entryId, updates)
    if (!updated) {
      console.warn('Failed to update material entry in Supabase, falling back to localStorage')
      return updateMaterialEntryLS(entryId, updates)
    }
    return updated
  } else {
    return updateMaterialEntryLS(entryId, updates)
  }
}

export async function reassignMaterialEntryToProject_Hybrid(entryId: string, newProjectId: string): Promise<any | null> {
  if (!isOnlineMode()) return null
  return reassignMaterialEntryToProjectDB(entryId, newProjectId)
}

export async function deleteMaterialEntry_Hybrid(entryId: string): Promise<boolean> {
  if (isOnlineMode()) {
    const deleted = await deleteMaterialEntryFromDB(entryId)
    if (!deleted) {
      console.warn('Failed to delete material entry in Supabase, falling back to localStorage')
      return deleteMaterialEntryLS(entryId)
    }
    return deleted
  } else {
    return deleteMaterialEntryLS(entryId)
  }
}

// ============================================================================
// SUBCONTRACTOR ENTRY OPERATIONS
// ============================================================================

export async function addSubcontractorEntry_Hybrid(projectId: string, entry: any): Promise<any | null> {
  if (isOnlineMode()) {
    const created = await createSubcontractorEntryInDB(projectId, entry)
    if (!created) {
      console.warn('Failed to create subcontractor entry in Supabase, falling back to localStorage')
      return addSubcontractorEntryLS(projectId, entry)
    }
    
    // Auto-sync to QuickBooks if connected (skip when entry was imported from QB)
    if (await isQBConnected() && !entry.qbTransactionId) {
      syncEntryToQB('subcontractor', created, entry).catch(err => {
        console.error('Background QB sync failed:', err)
      })
    }
    
    return created
  } else {
    return addSubcontractorEntryLS(projectId, entry)
  }
}

export async function updateSubcontractorEntry_Hybrid(entryId: string, updates: any): Promise<any | null> {
  if (isOnlineMode()) {
    const updated = await updateSubcontractorEntryInDB(entryId, updates)
    if (!updated) {
      console.warn('Failed to update subcontractor entry in Supabase, falling back to localStorage')
      return updateSubcontractorEntryLS(entryId, updates)
    }
    return updated
  } else {
    return updateSubcontractorEntryLS(entryId, updates)
  }
}

export async function reassignSubcontractorEntryToProject_Hybrid(entryId: string, newProjectId: string): Promise<any | null> {
  if (!isOnlineMode()) return null
  return reassignSubcontractorEntryToProjectDB(entryId, newProjectId)
}

export async function deleteSubcontractorEntry_Hybrid(entryId: string): Promise<boolean> {
  if (isOnlineMode()) {
    const deleted = await deleteSubcontractorEntryFromDB(entryId)
    if (!deleted) {
      console.warn('Failed to delete subcontractor entry in Supabase, falling back to localStorage')
      return deleteSubcontractorEntryLS(entryId)
    }
    return deleted
  } else {
    return deleteSubcontractorEntryLS(entryId)
  }
}

// ============================================================================
// GET ACTUALS OPERATIONS
// ============================================================================

function computeActualsTotals(
  laborEntries: any[],
  materialEntries: any[],
  subcontractorEntries: any[],
) {
  const totalLaborCost = laborEntries.reduce(
    (sum: number, entry: any) => sum + entry.totalCost,
    0,
  )
  const totalMaterialCost = materialEntries.reduce(
    (sum: number, entry: any) => sum + entry.totalCost,
    0,
  )
  const totalSubcontractorCost = subcontractorEntries.reduce(
    (sum: number, entry: any) => sum + entry.totalPaid,
    0,
  )
  const totalActualCost = totalLaborCost + totalMaterialCost + totalSubcontractorCost
  return {
    totalLaborCost,
    totalMaterialCost,
    totalSubcontractorCost,
    totalActualCost,
  }
}

function buildProjectActuals(
  projectId: string,
  laborEntries: any[],
  materialEntries: any[],
  subcontractorEntries: any[],
): ProjectActuals {
  const totals = computeActualsTotals(
    laborEntries,
    materialEntries,
    subcontractorEntries,
  )
  return {
    id: projectId + '_actuals',
    projectId,
    laborEntries,
    materialEntries,
    subcontractorEntries,
    ...totals,
    variance: 0,
    variancePercentage: 0,
    dailyLogs: [],
    changeOrders: [],
  }
}

function emptyProjectActuals(projectId: string): ProjectActuals {
  return buildProjectActuals(projectId, [], [], [])
}

export async function getActualsForProjects_Hybrid(
  projectIds: string[],
): Promise<Map<string, ProjectActuals>> {
  const map = new Map<string, ProjectActuals>()
  const uniqueIds = Array.from(new Set(projectIds.filter(Boolean)))

  if (uniqueIds.length === 0) return map

  if (isOnlineMode()) {
    const [laborRes, materialRes, subcontractorRes] = await Promise.all([
      supabase
        .from('labor_entries')
        .select('*')
        .in('project_id', uniqueIds)
        .order('date', { ascending: false }),
      supabase
        .from('material_entries')
        .select('*')
        .in('project_id', uniqueIds)
        .order('date', { ascending: false }),
      supabase
        .from('subcontractor_entries')
        .select('*')
        .in('project_id', uniqueIds)
        .order('date', { ascending: false }),
    ])

    if (laborRes.error) {
      throw new Error(`Error fetching labor entries: ${laborRes.error.message}`)
    }
    if (materialRes.error) {
      throw new Error(`Error fetching material entries: ${materialRes.error.message}`)
    }
    if (subcontractorRes.error) {
      throw new Error(
        `Error fetching subcontractor entries: ${subcontractorRes.error.message}`,
      )
    }

    const laborEntries = (laborRes.data ?? []).map((entry) => ({
      id: entry.id,
      projectId: entry.project_id,
      tradeId: entry.trade_id,
      date: new Date(entry.date),
      trade: entry.category,
      description: entry.description,
      totalHours: entry.hours,
      laborRate: entry.hourly_rate,
      totalCost: entry.amount,
      grossWages: entry.gross_wages != null ? Number(entry.gross_wages) : undefined,
      burdenAmount: entry.burden_amount != null ? Number(entry.burden_amount) : undefined,
      crew: [],
      createdAt: new Date(entry.created_at),
    }))
    const materialEntries = (materialRes.data ?? []).map((entry) => ({
      id: entry.id,
      projectId: entry.project_id,
      tradeId: entry.trade_id,
      date: new Date(entry.date),
      materialName: entry.description,
      category: entry.category,
      quantity: entry.quantity,
      unit: 'each',
      unitCost: entry.unit_cost,
      totalCost: entry.amount,
      vendor: entry.vendor,
      invoiceNumber: entry.invoice_number,
      createdAt: new Date(entry.created_at),
    }))
    const subcontractorEntries = (subcontractorRes.data ?? []).map((entry) => ({
      id: entry.id,
      projectId: entry.project_id,
      tradeId: entry.trade_id,
      subcontractor: {
        name: entry.subcontractor_name,
        company: entry.subcontractor_name,
        email: '',
        phone: '',
      },
      trade: entry.category,
      scopeOfWork: entry.description,
      contractAmount: entry.amount,
      payments: [],
      totalPaid: entry.amount,
      balance: 0,
      createdAt: new Date(entry.created_at),
    }))

    const laborByProject = new Map<string, any[]>()
    const materialsByProject = new Map<string, any[]>()
    const subcontractorsByProject = new Map<string, any[]>()

    for (const entry of laborEntries) {
      const existing = laborByProject.get(entry.projectId) ?? []
      existing.push(entry)
      laborByProject.set(entry.projectId, existing)
    }
    for (const entry of materialEntries) {
      const existing = materialsByProject.get(entry.projectId) ?? []
      existing.push(entry)
      materialsByProject.set(entry.projectId, existing)
    }
    for (const entry of subcontractorEntries) {
      const existing = subcontractorsByProject.get(entry.projectId) ?? []
      existing.push(entry)
      subcontractorsByProject.set(entry.projectId, existing)
    }

    for (const projectId of uniqueIds) {
      map.set(
        projectId,
        buildProjectActuals(
          projectId,
          laborByProject.get(projectId) ?? [],
          materialsByProject.get(projectId) ?? [],
          subcontractorsByProject.get(projectId) ?? [],
        ),
      )
    }
    return map
  }

  for (const projectId of uniqueIds) {
    map.set(projectId, getProjectActualsLS(projectId) ?? emptyProjectActuals(projectId))
  }
  return map
}

export async function getProjectActuals_Hybrid(projectId: string): Promise<any | null> {
  
  if (isOnlineMode()) {
    try {
      // Fetch all entries from Supabase
      const laborEntries = await fetchLaborEntries(projectId)
      
      const materialEntries = await fetchMaterialEntries(projectId)
      
      const subcontractorEntries = await fetchSubcontractorEntries(projectId)
      
      // Calculate totals
      const {
        totalLaborCost,
        totalMaterialCost,
        totalSubcontractorCost,
        totalActualCost,
      } = computeActualsTotals(laborEntries, materialEntries, subcontractorEntries)
      
      const result = buildProjectActuals(
        projectId,
        laborEntries,
        materialEntries,
        subcontractorEntries,
      )
      
      return result
    } catch (error) {
      console.error('❌ Error fetching actuals from Supabase:', error)
      // Fall back to localStorage
      const localResult = getProjectActualsLS(projectId)
      return localResult
    }
  } else {
    const localResult = getProjectActualsLS(projectId)
    return localResult
  }
}

// ============================================================================
// QUICKBOOKS SYNC HELPER
// ============================================================================

/**
 * Sync an actuals entry to QuickBooks as a Check
 */
async function syncEntryToQB(entryType: 'labor' | 'material' | 'subcontractor', created: any, originalEntry: any): Promise<void> {
  
  try {
    // Determine vendor name based on entry type
    let vendorName = 'Unknown Vendor'
    if (entryType === 'subcontractor') {
      vendorName = originalEntry.subcontractorName || 'Unknown Subcontractor'
    } else if (entryType === 'material') {
      vendorName = originalEntry.vendor || 'Material Supplier'
    } else {
      vendorName = 'Labor'
    }
    
    // Get project name for the check note
    const { data: project } = await supabase
      .from('projects')
      .select('name')
      .eq('id', created.projectId)
      .single()
    
    const projectName = project?.name || 'Unknown Project'
    
    // Create check in QuickBooks
    const result = await createQBCheck({
      vendorName,
      amount: created.totalCost || created.totalPaid,
      description: created.description || created.scopeOfWork,
      date: created.date,
      projectName,
      category: originalEntry.trade || originalEntry.category,
    })
    
    if (result.success) {
      
      // Update entry with QB sync status
      const table = entryType === 'labor' ? 'labor_entries' :
                    entryType === 'material' ? 'material_entries' : 'subcontractor_entries'
      
      await supabase
        .from(table)
        .update({
          qb_sync_status: 'synced',
          qb_check_id: result.checkId,
          qb_synced_at: new Date().toISOString(),
        })
        .eq('id', created.id)
    } else {
      console.error(`❌ QB sync failed: ${result.error}`)
      
      // Mark as failed with error message
      const table = entryType === 'labor' ? 'labor_entries' :
                    entryType === 'material' ? 'material_entries' : 'subcontractor_entries'
      
      await supabase
        .from(table)
        .update({
          qb_sync_status: 'failed',
          qb_sync_error: result.error,
        })
        .eq('id', created.id)
    }
  } catch (error) {
    console.error('Error syncing to QB:', error)
  }
}

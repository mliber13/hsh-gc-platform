/**
 * Hybrid Actuals Service
 * Routes actuals operations to either localStorage or Supabase based on online mode
 */

import { isOnlineMode } from '@/lib/supabase'
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

export async function getProjectActuals_Hybrid(projectId: string): Promise<any | null> {
  if (isOnlineMode()) {
    try {
      // Fetch all entries from Supabase
      const laborEntries = await fetchLaborEntries(projectId)
      const materialEntries = await fetchMaterialEntries(projectId)
      const subcontractorEntries = await fetchSubcontractorEntries(projectId)
      
      // Calculate totals
      const totalLaborCost = laborEntries.reduce((sum: number, entry: any) => sum + entry.totalCost, 0)
      const totalMaterialCost = materialEntries.reduce((sum: number, entry: any) => sum + entry.totalCost, 0)
      const totalSubcontractorCost = subcontractorEntries.reduce((sum: number, entry: any) => sum + entry.totalPaid, 0)
      const totalActualCost = totalLaborCost + totalMaterialCost + totalSubcontractorCost
      
      return {
        id: projectId + '_actuals',
        projectId,
        laborEntries,
        materialEntries,
        subcontractorEntries,
        totalLaborCost,
        totalMaterialCost,
        totalSubcontractorCost,
        totalActualCost,
        variance: 0,
        variancePercentage: 0,
        dailyLogs: [],
        changeOrders: [],
      }
    } catch (error) {
      console.error('Error fetching actuals from Supabase:', error)
      // Fall back to localStorage
      return getProjectActualsLS(projectId)
    }
  } else {
    return getProjectActualsLS(projectId)
  }
}


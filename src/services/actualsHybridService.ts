/**
 * Hybrid Actuals Service
 * Routes actuals operations to either localStorage or Supabase based on online mode
 * Includes automatic QuickBooks sync when connected
 */

import { isOnlineMode, supabase } from '@/lib/supabase'
import { getCategoryGroup } from '@/types'
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
  fetchLaborEntries,
  fetchMaterialEntries,
  fetchSubcontractorEntries,
} from './supabaseService'

// ============================================================================
// LABOR ENTRY OPERATIONS
// ============================================================================

export async function addLaborEntry_Hybrid(projectId: string, entry: any): Promise<any | null> {
  // Auto-populate group field based on trade category
  const entryWithGroup = {
    ...entry,
    group: entry.trade ? getCategoryGroup(entry.trade) : undefined
  }

  if (isOnlineMode()) {
    const created = await createLaborEntryInDB(projectId, entryWithGroup)
    if (!created) {
      console.warn('Failed to create labor entry in Supabase, falling back to localStorage')
      return addLaborEntryLS(projectId, entryWithGroup)
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
  // Auto-populate group field based on category
  const entryWithGroup = {
    ...entry,
    group: entry.category ? getCategoryGroup(entry.category) : undefined
  }

  if (isOnlineMode()) {
    const created = await createMaterialEntryInDB(projectId, entryWithGroup)
    if (!created) {
      console.warn('Failed to create material entry in Supabase, falling back to localStorage')
      return addMaterialEntryLS(projectId, entryWithGroup)
    }
    
    // Auto-sync to QuickBooks if connected
    if (await isQBConnected()) {
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
  // Auto-populate group field based on trade category
  const entryWithGroup = {
    ...entry,
    group: entry.trade ? getCategoryGroup(entry.trade) : undefined
  }

  if (isOnlineMode()) {
    const created = await createSubcontractorEntryInDB(projectId, entryWithGroup)
    if (!created) {
      console.warn('Failed to create subcontractor entry in Supabase, falling back to localStorage')
      return addSubcontractorEntryLS(projectId, entryWithGroup)
    }
    
    // Auto-sync to QuickBooks if connected
    if (await isQBConnected()) {
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
  console.log('🔍 getProjectActuals_Hybrid called for project:', projectId)
  
  if (isOnlineMode()) {
    console.log('🌐 Online mode - fetching from Supabase')
    try {
      // Fetch all entries from Supabase
      console.log('📡 Fetching labor entries...')
      const laborEntries = await fetchLaborEntries(projectId)
      console.log('📡 Labor entries fetched:', laborEntries.length, laborEntries)
      
      console.log('📡 Fetching material entries...')
      const materialEntries = await fetchMaterialEntries(projectId)
      console.log('📡 Material entries fetched:', materialEntries.length, materialEntries)
      
      console.log('📡 Fetching subcontractor entries...')
      const subcontractorEntries = await fetchSubcontractorEntries(projectId)
      console.log('📡 Subcontractor entries fetched:', subcontractorEntries.length, subcontractorEntries)
      
      // Calculate totals
      const totalLaborCost = laborEntries.reduce((sum: number, entry: any) => sum + entry.totalCost, 0)
      const totalMaterialCost = materialEntries.reduce((sum: number, entry: any) => sum + entry.totalCost, 0)
      const totalSubcontractorCost = subcontractorEntries.reduce((sum: number, entry: any) => sum + entry.totalPaid, 0)
      const totalActualCost = totalLaborCost + totalMaterialCost + totalSubcontractorCost
      
      console.log('💰 Calculated totals:', {
        totalLaborCost,
        totalMaterialCost,
        totalSubcontractorCost,
        totalActualCost
      })
      
      const result = {
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
      
      console.log('✅ Returning actuals result:', result)
      return result
    } catch (error) {
      console.error('❌ Error fetching actuals from Supabase:', error)
      console.log('🔄 Falling back to localStorage...')
      // Fall back to localStorage
      const localResult = getProjectActualsLS(projectId)
      console.log('💾 localStorage result:', localResult)
      return localResult
    }
  } else {
    console.log('💾 Offline mode - using localStorage')
    const localResult = getProjectActualsLS(projectId)
    console.log('💾 localStorage result:', localResult)
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
  console.log(`📤 Syncing ${entryType} entry to QuickBooks...`)
  
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
      console.log(`✅ Synced to QuickBooks - Check ID: ${result.checkId}`)
      
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


// ============================================================================
// Local Storage Service
// ============================================================================
// 
// Handles all data persistence using localStorage
// Will be replaced with cloud database (Supabase/Firebase) in Phase 3+
//

import type {
  Project,
  Estimate,
  Trade,
  TakeoffItem,
  ProjectActuals,
  LaborEntry,
  MaterialEntry,
  SubcontractorEntry,
  DailyLog,
  ChangeOrder,
  TimeClockEntry,
  HistoricalRate,
  User,
  UserPreferences,
} from '@/types/project'

import type {
  EstimateTemplate,
  ScheduleTemplate,
} from '@/types/forms'

// ----------------------------------------------------------------------------
// Storage Keys
// ----------------------------------------------------------------------------

const STORAGE_KEYS = {
  PROJECTS: 'hsh_gc_projects',
  ESTIMATES: 'hsh_gc_estimates',
  TRADES: 'hsh_gc_trades',
  TAKEOFF_ITEMS: 'hsh_gc_takeoff_items',
  ACTUALS: 'hsh_gc_actuals',
  LABOR_ENTRIES: 'hsh_gc_labor_entries',
  MATERIAL_ENTRIES: 'hsh_gc_material_entries',
  SUBCONTRACTOR_ENTRIES: 'hsh_gc_subcontractor_entries',
  DAILY_LOGS: 'hsh_gc_daily_logs',
  CHANGE_ORDERS: 'hsh_gc_change_orders',
  TIME_CLOCK_ENTRIES: 'hsh_gc_time_clock_entries',
  HISTORICAL_RATES: 'hsh_gc_historical_rates',
  ESTIMATE_TEMPLATES: 'hsh_gc_estimate_templates',
  SCHEDULE_TEMPLATES: 'hsh_gc_schedule_templates',
  USER_PREFERENCES: 'hsh_gc_user_preferences',
  CURRENT_USER: 'hsh_gc_current_user',
} as const

// ----------------------------------------------------------------------------
// Generic Storage Operations
// ----------------------------------------------------------------------------

class StorageService<T extends { id: string }> {
  private storageKey: string
  
  constructor(storageKey: string) {
    this.storageKey = storageKey
  }

  /**
   * Get all items
   */
  getAll(): T[] {
    try {
      const data = localStorage.getItem(this.storageKey)
      if (!data) return []
      return JSON.parse(data, this.dateReviver) as T[]
    } catch (error) {
      console.error(`Error reading ${this.storageKey}:`, error)
      return []
    }
  }

  /**
   * Get item by ID
   */
  getById(id: string): T | null {
    const items = this.getAll()
    return items.find(item => item.id === id) || null
  }

  /**
   * Get multiple items by IDs
   */
  getByIds(ids: string[]): T[] {
    const items = this.getAll()
    return items.filter(item => ids.includes(item.id))
  }

  /**
   * Create new item
   */
  create(item: T): T {
    const items = this.getAll()
    items.push(item)
    this.saveAll(items)
    return item
  }

  /**
   * Update existing item
   */
  update(id: string, updates: Partial<T>): T | null {
    const items = this.getAll()
    const index = items.findIndex(item => item.id === id)
    
    if (index === -1) {
      console.error(`Item with id ${id} not found in ${this.storageKey}`)
      return null
    }

    items[index] = { ...items[index], ...updates }
    this.saveAll(items)
    return items[index]
  }

  /**
   * Delete item by ID
   */
  delete(id: string): boolean {
    const items = this.getAll()
    const filteredItems = items.filter(item => item.id !== id)
    
    if (filteredItems.length === items.length) {
      return false // Item not found
    }

    this.saveAll(filteredItems)
    return true
  }

  /**
   * Delete multiple items by IDs
   */
  deleteMany(ids: string[]): number {
    const items = this.getAll()
    const filteredItems = items.filter(item => !ids.includes(item.id))
    const deletedCount = items.length - filteredItems.length
    
    this.saveAll(filteredItems)
    return deletedCount
  }

  /**
   * Save all items (replaces entire collection)
   */
  saveAll(items: T[]): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(items))
    } catch (error) {
      console.error(`Error saving to ${this.storageKey}:`, error)
      throw new Error('Failed to save data to localStorage')
    }
  }

  /**
   * Clear all items
   */
  clear(): void {
    localStorage.removeItem(this.storageKey)
  }

  /**
   * Get filtered items
   */
  filter(predicate: (item: T) => boolean): T[] {
    return this.getAll().filter(predicate)
  }

  /**
   * Find single item
   */
  find(predicate: (item: T) => boolean): T | null {
    return this.getAll().find(predicate) || null
  }

  /**
   * Count items
   */
  count(): number {
    return this.getAll().length
  }

  /**
   * Check if item exists
   */
  exists(id: string): boolean {
    return this.getById(id) !== null
  }

  /**
   * Date reviver for JSON.parse to convert date strings to Date objects
   */
  private dateReviver(key: string, value: any): any {
    if (typeof value === 'string') {
      // Check if it's an ISO date string
      const dateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      if (dateRegex.test(value)) {
        return new Date(value)
      }
    }
    return value
  }
}

// ----------------------------------------------------------------------------
// Service Instances
// ----------------------------------------------------------------------------

export const projectStorage = new StorageService<Project>(STORAGE_KEYS.PROJECTS)
export const estimateStorage = new StorageService<Estimate>(STORAGE_KEYS.ESTIMATES)
export const tradeStorage = new StorageService<Trade>(STORAGE_KEYS.TRADES)
export const takeoffStorage = new StorageService<TakeoffItem>(STORAGE_KEYS.TAKEOFF_ITEMS)
export const actualsStorage = new StorageService<ProjectActuals>(STORAGE_KEYS.ACTUALS)
export const laborStorage = new StorageService<LaborEntry>(STORAGE_KEYS.LABOR_ENTRIES)
export const materialStorage = new StorageService<MaterialEntry>(STORAGE_KEYS.MATERIAL_ENTRIES)
export const subcontractorStorage = new StorageService<SubcontractorEntry>(STORAGE_KEYS.SUBCONTRACTOR_ENTRIES)
export const dailyLogStorage = new StorageService<DailyLog>(STORAGE_KEYS.DAILY_LOGS)
export const changeOrderStorage = new StorageService<ChangeOrder>(STORAGE_KEYS.CHANGE_ORDERS)
export const timeClockStorage = new StorageService<TimeClockEntry>(STORAGE_KEYS.TIME_CLOCK_ENTRIES)
export const historicalRateStorage = new StorageService<HistoricalRate>(STORAGE_KEYS.HISTORICAL_RATES)
export const estimateTemplateStorage = new StorageService<EstimateTemplate>(STORAGE_KEYS.ESTIMATE_TEMPLATES)
export const scheduleTemplateStorage = new StorageService<ScheduleTemplate>(STORAGE_KEYS.SCHEDULE_TEMPLATES)

// ----------------------------------------------------------------------------
// Helper Functions for Complex Operations
// ----------------------------------------------------------------------------

/**
 * Get complete project with all related data
 */
export function getCompleteProject(projectId: string): Project | null {
  const project = projectStorage.getById(projectId)
  if (!project) return null

  // Project already contains estimate and actuals by reference
  // This function can be extended to eager-load related data if needed
  return project
}

/**
 * Get all trades for an estimate
 */
export function getTradesForEstimate(estimateId: string): Trade[] {
  return tradeStorage.filter(trade => trade.estimateId === estimateId)
}

/**
 * Get all takeoff items for an estimate
 */
export function getTakeoffForEstimate(estimateId: string): TakeoffItem[] {
  return takeoffStorage.filter(item => item.estimateId === estimateId)
}

/**
 * Get all labor entries for a project
 */
export function getLaborEntriesForProject(projectId: string): LaborEntry[] {
  return laborStorage.filter(entry => entry.projectId === projectId)
}

/**
 * Get all material entries for a project
 */
export function getMaterialEntriesForProject(projectId: string): MaterialEntry[] {
  return materialStorage.filter(entry => entry.projectId === projectId)
}

/**
 * Get all subcontractor entries for a project
 */
export function getSubcontractorEntriesForProject(projectId: string): SubcontractorEntry[] {
  return subcontractorStorage.filter(entry => entry.projectId === projectId)
}

/**
 * Get all daily logs for a project
 */
export function getDailyLogsForProject(projectId: string): DailyLog[] {
  return dailyLogStorage.filter(log => log.projectId === projectId)
}

/**
 * Get all change orders for a project
 */
export function getChangeOrdersForProject(projectId: string): ChangeOrder[] {
  return changeOrderStorage.filter(co => co.projectId === projectId)
}

/**
 * Get all time clock entries for a project
 */
export function getTimeClockEntriesForProject(projectId: string): TimeClockEntry[] {
  return timeClockStorage.filter(entry => entry.projectId === projectId)
}

/**
 * Get active projects (in-progress status)
 */
export function getActiveProjects(): Project[] {
  return projectStorage.filter(project => project.status === 'in-progress')
}

/**
 * Get projects by status
 */
export function getProjectsByStatus(status: Project['status']): Project[] {
  return projectStorage.filter(project => project.status === status)
}

/**
 * Get projects by client
 */
export function getProjectsByClient(clientId: string): Project[] {
  return projectStorage.filter(project => project.client.id === clientId)
}

/**
 * Search projects by name or project number
 */
export function searchProjects(searchTerm: string): Project[] {
  const term = searchTerm.toLowerCase()
  return projectStorage.filter(project => {
    return project.name.toLowerCase().includes(term) ||
      (project.projectNumber?.toLowerCase().includes(term) ?? false)
  })
}

// ----------------------------------------------------------------------------
// User Preferences
// ----------------------------------------------------------------------------

export function getUserPreferences(): UserPreferences | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.USER_PREFERENCES)
    return data ? JSON.parse(data) : null
  } catch (error) {
    console.error('Error reading user preferences:', error)
    return null
  }
}

export function saveUserPreferences(preferences: UserPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(preferences))
  } catch (error) {
    console.error('Error saving user preferences:', error)
    throw error
  }
}

export function getCurrentUser(): User | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.CURRENT_USER)
    return data ? JSON.parse(data) : null
  } catch (error) {
    console.error('Error reading current user:', error)
    return null
  }
}

export function saveCurrentUser(user: User): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user))
  } catch (error) {
    console.error('Error saving current user:', error)
    throw error
  }
}

// ----------------------------------------------------------------------------
// Data Export/Import
// ----------------------------------------------------------------------------

export interface ExportData {
  version: string
  exportDate: Date
  projects: Project[]
  estimates: Estimate[]
  trades: Trade[]
  takeoffItems: TakeoffItem[]
  actuals: ProjectActuals[]
  laborEntries: LaborEntry[]
  materialEntries: MaterialEntry[]
  subcontractorEntries: SubcontractorEntry[]
  dailyLogs: DailyLog[]
  changeOrders: ChangeOrder[]
  timeClockEntries: TimeClockEntry[]
  historicalRates: HistoricalRate[]
  estimateTemplates: EstimateTemplate[]
  scheduleTemplates: ScheduleTemplate[]
  plans: any[] // Plan type from plan.ts
  itemTemplates: any[] // ItemTemplate type from itemTemplate.ts
  userPreferences: UserPreferences | null
}

/**
 * Export all data as JSON
 */
export function exportAllData(): ExportData {
  // Get item templates from their separate storage
  const itemTemplatesData = localStorage.getItem('hsh_gc_item_templates')
  const itemTemplates = itemTemplatesData ? JSON.parse(itemTemplatesData) : []
  
  // Get plans from their separate storage (uses old key format)
  const plansData = localStorage.getItem('hsh-plans')
  const plans = plansData ? JSON.parse(plansData) : []
  
  return {
    version: '1.0.0',
    exportDate: new Date(),
    projects: projectStorage.getAll(),
    estimates: estimateStorage.getAll(),
    trades: tradeStorage.getAll(),
    takeoffItems: takeoffStorage.getAll(),
    actuals: actualsStorage.getAll(),
    laborEntries: laborStorage.getAll(),
    materialEntries: materialStorage.getAll(),
    subcontractorEntries: subcontractorStorage.getAll(),
    dailyLogs: dailyLogStorage.getAll(),
    changeOrders: changeOrderStorage.getAll(),
    timeClockEntries: timeClockStorage.getAll(),
    historicalRates: historicalRateStorage.getAll(),
    estimateTemplates: estimateTemplateStorage.getAll(),
    scheduleTemplates: scheduleTemplateStorage.getAll(),
    plans: plans,
    itemTemplates: itemTemplates,
    userPreferences: getUserPreferences(),
  }
}

/**
 * Import data from JSON
 */
export function importAllData(data: ExportData, merge: boolean = false): void {
  try {
    if (!merge) {
      // Clear existing data first
      clearAllData()
    }

    console.log('Starting import...')

    // Import all collections - use empty arrays as defaults
    projectStorage.saveAll(data.projects || [])
    console.log('Projects imported:', data.projects?.length || 0)
    
    estimateStorage.saveAll(data.estimates || [])
    console.log('Estimates imported:', data.estimates?.length || 0)
    
    tradeStorage.saveAll(data.trades || [])
    console.log('Trades imported:', data.trades?.length || 0)
    
    takeoffStorage.saveAll(data.takeoffItems || [])
    actualsStorage.saveAll(data.actuals || [])
    laborStorage.saveAll(data.laborEntries || [])
    console.log('Labor entries imported:', data.laborEntries?.length || 0)
    
    materialStorage.saveAll(data.materialEntries || [])
    console.log('Material entries imported:', data.materialEntries?.length || 0)
    
    subcontractorStorage.saveAll(data.subcontractorEntries || [])
    console.log('Subcontractor entries imported:', data.subcontractorEntries?.length || 0)
    
    dailyLogStorage.saveAll(data.dailyLogs || [])
    changeOrderStorage.saveAll(data.changeOrders || [])
    timeClockStorage.saveAll(data.timeClockEntries || [])
    historicalRateStorage.saveAll(data.historicalRates || [])
    estimateTemplateStorage.saveAll(data.estimateTemplates || [])
    scheduleTemplateStorage.saveAll(data.scheduleTemplates || [])
    
    if (data.itemTemplates) {
      localStorage.setItem('hsh_gc_item_templates', JSON.stringify(data.itemTemplates))
      console.log('Item templates imported:', data.itemTemplates?.length || 0)
    }
    
    if (data.plans) {
      localStorage.setItem('hsh-plans', JSON.stringify(data.plans))
      console.log('Plans imported:', data.plans?.length || 0)
    }
    
    if (data.userPreferences) {
      saveUserPreferences(data.userPreferences)
    }

    console.log('✅ All data imported successfully')
  } catch (error) {
    console.error('❌ Error importing data:', error)
    throw new Error('Failed to import data')
  }
}

/**
 * Download data as JSON file
 */
export function downloadBackup(): void {
  const data = exportAllData()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `hsh-gc-backup-${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Clear all data (use with caution!)
 */
export function clearAllData(): void {
  Object.values(STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key)
  })
  // Also clear item templates and plans (separate storage keys)
  localStorage.removeItem('hsh_gc_item_templates')
  localStorage.removeItem('hsh-plans')
  console.log('All data cleared')
}

/**
 * Get storage usage statistics
 */
export function getStorageStats() {
  const stats = {
    projects: projectStorage.count(),
    estimates: estimateStorage.count(),
    trades: tradeStorage.count(),
    takeoffItems: takeoffStorage.count(),
    laborEntries: laborStorage.count(),
    materialEntries: materialStorage.count(),
    subcontractorEntries: subcontractorStorage.count(),
    dailyLogs: dailyLogStorage.count(),
    changeOrders: changeOrderStorage.count(),
    timeClockEntries: timeClockStorage.count(),
    historicalRates: historicalRateStorage.count(),
    estimateTemplates: estimateTemplateStorage.count(),
    scheduleTemplates: scheduleTemplateStorage.count(),
  }

  // Calculate approximate storage size
  let totalSize = 0
  Object.values(STORAGE_KEYS).forEach(key => {
    const data = localStorage.getItem(key)
    if (data) {
      totalSize += new Blob([data]).size
    }
  })

  return {
    ...stats,
    totalSize,
    totalSizeKB: (totalSize / 1024).toFixed(2),
    totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
  }
}

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------

/**
 * Validate localStorage is available and working
 */
export function validateStorage(): boolean {
  try {
    const testKey = '__hsh_gc_test__'
    localStorage.setItem(testKey, 'test')
    localStorage.removeItem(testKey)
    return true
  } catch (error) {
    console.error('localStorage is not available:', error)
    return false
  }
}


// ============================================================================
// Backup Service
// ============================================================================
//
// Provides functionality to backup and restore all user data
//

import { supabase } from '@/lib/supabase'

export interface BackupData {
  version: string
  timestamp: string
  userId: string
  organizationId: string | null
  data: {
    projects: any[]
    estimates: any[]
    trades: any[]
    plans: any[]
    itemTemplates: any[]
    estimateTemplates: any[]
    laborEntries: any[]
    materialEntries: any[]
    subcontractorEntries: any[]
    schedules: any[]
    changeOrders: any[]
    profile: any
  }
}

/**
 * Export all user data from Supabase
 */
export async function exportAllData(): Promise<BackupData> {
  console.log('🔄 Starting data backup...')

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    throw new Error('Not authenticated')
  }

  // Get user profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError) {
    console.error('Error fetching profile:', profileError)
    throw new Error('Failed to fetch user profile')
  }

  const organizationId = profile.organization_id

  console.log(`📦 Backing up data for user: ${user.id}`)
  console.log(`🏢 Organization: ${organizationId || 'Personal'}`)

  // Fetch all data in parallel
  const [
    projectsRes,
    estimatesRes,
    tradesRes,
    plansRes,
    itemTemplatesRes,
    estimateTemplatesRes,
    laborEntriesRes,
    materialEntriesRes,
    subcontractorEntriesRes,
    schedulesRes,
    changeOrdersRes,
  ] = await Promise.all([
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    supabase.from('estimates').select('*').order('created_at', { ascending: false }),
    supabase.from('trades').select('*').order('created_at', { ascending: false }),
    supabase.from('plans').select('*').order('created_at', { ascending: false }),
    supabase.from('item_templates').select('*').order('created_at', { ascending: false }),
    supabase.from('estimate_templates').select('*').order('created_at', { ascending: false }),
    supabase.from('labor_entries').select('*').order('created_at', { ascending: false }),
    supabase.from('material_entries').select('*').order('created_at', { ascending: false }),
    supabase.from('subcontractor_entries').select('*').order('created_at', { ascending: false }),
    supabase.from('schedules').select('*').order('created_at', { ascending: false }),
    supabase.from('change_orders').select('*').order('created_at', { ascending: false }),
  ])

  // Check for errors
  const errors = [
    projectsRes.error,
    estimatesRes.error,
    tradesRes.error,
    plansRes.error,
    itemTemplatesRes.error,
    estimateTemplatesRes.error,
    laborEntriesRes.error,
    materialEntriesRes.error,
    subcontractorEntriesRes.error,
    schedulesRes.error,
    changeOrdersRes.error,
  ].filter(Boolean)

  if (errors.length > 0) {
    console.error('Errors during backup:', errors)
    throw new Error(`Failed to backup data: ${errors[0]?.message}`)
  }

  const backup: BackupData = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    userId: user.id,
    organizationId: organizationId || null,
    data: {
      projects: projectsRes.data || [],
      estimates: estimatesRes.data || [],
      trades: tradesRes.data || [],
      plans: plansRes.data || [],
      itemTemplates: itemTemplatesRes.data || [],
      estimateTemplates: estimateTemplatesRes.data || [],
      laborEntries: laborEntriesRes.data || [],
      materialEntries: materialEntriesRes.data || [],
      subcontractorEntries: subcontractorEntriesRes.data || [],
      schedules: schedulesRes.data || [],
      changeOrders: changeOrdersRes.data || [],
      profile: profile,
    },
  }

  console.log('✅ Backup complete!')
  console.log(`📊 Stats:`)
  console.log(`   Projects: ${backup.data.projects.length}`)
  console.log(`   Estimates: ${backup.data.estimates.length}`)
  console.log(`   Trades: ${backup.data.trades.length}`)
  console.log(`   Plans: ${backup.data.plans.length}`)
  console.log(`   Item Templates: ${backup.data.itemTemplates.length}`)
  console.log(`   Labor Entries: ${backup.data.laborEntries.length}`)
  console.log(`   Material Entries: ${backup.data.materialEntries.length}`)
  console.log(`   Subcontractor Entries: ${backup.data.subcontractorEntries.length}`)
  console.log(`   Schedules: ${backup.data.schedules.length}`)
  console.log(`   Change Orders: ${backup.data.changeOrders.length}`)

  return backup
}

/**
 * Download backup data as a JSON file
 */
export function downloadBackup(backup: BackupData): void {
  const json = JSON.stringify(backup, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  // Format timestamp for filename
  const date = new Date(backup.timestamp)
  const filename = `hsh-backup-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}.json`

  // Create download link
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()

  // Cleanup
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  console.log(`💾 Downloaded backup: ${filename}`)
}

/**
 * Complete backup workflow: export and download
 */
export async function backupAllData(): Promise<void> {
  try {
    const backup = await exportAllData()
    downloadBackup(backup)
  } catch (error) {
    console.error('❌ Backup failed:', error)
    throw error
  }
}

/**
 * Parse and validate a backup file
 */
export async function parseBackupFile(file: File): Promise<BackupData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const backup = JSON.parse(e.target?.result as string) as BackupData

        // Validate backup structure
        if (!backup.version || !backup.timestamp || !backup.data) {
          throw new Error('Invalid backup file format')
        }

        console.log('✅ Backup file validated')
        resolve(backup)
      } catch (error) {
        console.error('❌ Failed to parse backup file:', error)
        reject(new Error('Invalid backup file'))
      }
    }

    reader.onerror = () => {
      reject(new Error('Failed to read backup file'))
    }

    reader.readAsText(file)
  })
}

/**
 * Restore data from backup (Future feature)
 * WARNING: This will overwrite existing data
 */
export async function restoreFromBackup(backup: BackupData): Promise<void> {
  console.warn('⚠️ Restore functionality not yet implemented')
  console.log('Backup contains:', {
    projects: backup.data.projects.length,
    estimates: backup.data.estimates.length,
    trades: backup.data.trades.length,
  })
  
  // TODO: Implement restore logic
  // This would need careful consideration for:
  // - Conflict resolution (what if data already exists?)
  // - User confirmation
  // - Transaction handling (all-or-nothing)
  // - Organization boundaries
  
  throw new Error('Restore functionality coming soon')
}


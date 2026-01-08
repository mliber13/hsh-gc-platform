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
    deals: any[]
    dealNotes: any[]
    projectDocuments: any[]
    selectionBooks: any[]
    selectionRooms: any[]
    selectionRoomImages: any[]
    selectionRoomSpecSheets: any[]
    projectForms: any[]
    formTemplates: any[]
    formResponses: any[]
    quoteRequests: any[]
    submittedQuotes: any[]
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

  // Helper to check if a string is a valid UUID
  const isValidUUID = (str: string | null): boolean => {
    if (!str) return false
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(str)
  }

  // Build organization filter for tables that use TEXT organization_id
  const orgFilter = organizationId 
    ? (table: string, orderBy: string = 'created_at') => supabase.from(table).select('*').eq('organization_id', organizationId).order(orderBy, { ascending: false })
    : (table: string, orderBy: string = 'created_at') => supabase.from(table).select('*').order(orderBy, { ascending: false })

  // For tables that use UUID organization_id, only filter if organizationId is a valid UUID
  const orgFilterUUID = (table: string, orderBy: string = 'created_at') => {
    if (organizationId && isValidUUID(organizationId)) {
      return supabase.from(table).select('*').eq('organization_id', organizationId).order(orderBy, { ascending: false })
    }
    // If not a valid UUID (e.g., "default-org"), fetch all without filtering
    return supabase.from(table).select('*').order(orderBy, { ascending: false })
  }

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
    dealsRes,
    dealNotesRes,
    projectDocumentsRes,
    selectionBooksRes,
    selectionRoomsRes,
    selectionRoomImagesRes,
    selectionRoomSpecSheetsRes,
    projectFormsRes,
    formTemplatesRes,
    formResponsesRes,
    quoteRequestsRes,
    submittedQuotesRes,
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
    orgFilter('deals'),
    orgFilter('deal_notes'),
    supabase.from('project_documents').select('*').order('created_at', { ascending: false }),
    orgFilter('selection_books'),
    supabase.from('selection_rooms').select('*').order('created_at', { ascending: false }),
    supabase.from('selection_room_images').select('*').order('created_at', { ascending: false }),
    supabase.from('selection_room_spec_sheets').select('*').order('created_at', { ascending: false }),
    orgFilter('project_forms'),
    orgFilter('form_templates'),
    orgFilter('form_responses', 'responded_at'), // form_responses uses responded_at instead of created_at
    orgFilterUUID('quote_requests'), // quote_requests uses UUID for organization_id
    supabase.from('submitted_quotes').select('*').order('created_at', { ascending: false }), // submitted_quotes doesn't have organization_id, linked via quote_request_id
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
    dealsRes.error,
    dealNotesRes.error,
    projectDocumentsRes.error,
    selectionBooksRes.error,
    selectionRoomsRes.error,
    selectionRoomImagesRes.error,
    selectionRoomSpecSheetsRes.error,
    projectFormsRes.error,
    formTemplatesRes.error,
    formResponsesRes.error,
    quoteRequestsRes.error,
    submittedQuotesRes.error,
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
      deals: dealsRes.data || [],
      dealNotes: dealNotesRes.data || [],
      projectDocuments: projectDocumentsRes.data || [],
      selectionBooks: selectionBooksRes.data || [],
      selectionRooms: selectionRoomsRes.data || [],
      selectionRoomImages: selectionRoomImagesRes.data || [],
      selectionRoomSpecSheets: selectionRoomSpecSheetsRes.data || [],
      projectForms: projectFormsRes.data || [],
      formTemplates: formTemplatesRes.data || [],
      formResponses: formResponsesRes.data || [],
      quoteRequests: quoteRequestsRes.data || [],
      submittedQuotes: submittedQuotesRes.data || [],
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
  console.log(`   Deals: ${backup.data.deals.length}`)
  console.log(`   Deal Notes: ${backup.data.dealNotes.length}`)
  console.log(`   Project Documents: ${backup.data.projectDocuments.length}`)
  console.log(`   Selection Books: ${backup.data.selectionBooks.length}`)
  console.log(`   Selection Rooms: ${backup.data.selectionRooms.length}`)
  console.log(`   Selection Room Images: ${backup.data.selectionRoomImages.length}`)
  console.log(`   Selection Room Spec Sheets: ${backup.data.selectionRoomSpecSheets.length}`)
  console.log(`   Project Forms: ${backup.data.projectForms.length}`)
  console.log(`   Form Templates: ${backup.data.formTemplates.length}`)
  console.log(`   Form Responses: ${backup.data.formResponses.length}`)
  console.log(`   Quote Requests: ${backup.data.quoteRequests.length}`)
  console.log(`   Submitted Quotes: ${backup.data.submittedQuotes.length}`)

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
    deals: backup.data.deals.length,
    dealNotes: backup.data.dealNotes.length,
    projectDocuments: backup.data.projectDocuments.length,
    selectionBooks: backup.data.selectionBooks.length,
    projectForms: backup.data.projectForms.length,
    quoteRequests: backup.data.quoteRequests.length,
  })
  
  // TODO: Implement restore logic
  // This would need careful consideration for:
  // - Conflict resolution (what if data already exists?)
  // - User confirmation
  // - Transaction handling (all-or-nothing)
  // - Organization boundaries
  
  throw new Error('Restore functionality coming soon')
}


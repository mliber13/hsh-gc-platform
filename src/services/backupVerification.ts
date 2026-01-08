// ============================================================================
// Backup Verification Utility
// ============================================================================
//
// Verifies that a backup file contains all expected data tables and fields
//

import type { BackupData } from './backupService'

export interface VerificationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  stats: {
    [key: string]: {
      count: number
      hasData: boolean
    }
  }
  missingTables: string[]
  emptyTables: string[]
}

/**
 * Verify a backup file structure and content
 */
export function verifyBackup(backup: BackupData): VerificationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const stats: { [key: string]: { count: number; hasData: boolean } } = {}
  const missingTables: string[] = []
  const emptyTables: string[] = []

  // Expected tables in the backup
  const expectedTables = [
    'projects',
    'estimates',
    'trades',
    'plans',
    'itemTemplates',
    'estimateTemplates',
    'laborEntries',
    'materialEntries',
    'subcontractorEntries',
    'schedules',
    'changeOrders',
    'deals',
    'dealNotes',
    'projectDocuments',
    'selectionBooks',
    'selectionRooms',
    'selectionRoomImages',
    'selectionRoomSpecSheets',
    'projectForms',
    'formTemplates',
    'formResponses',
    'quoteRequests',
    'submittedQuotes',
    'projectActuals',
    'subItems',
    'proformaInputs',
    'sowTemplates',
    'subcontractors',
    'suppliers',
    'userInvitations',
    'feedback',
    'profiles',
  ]

  // Verify backup structure
  if (!backup.version) {
    errors.push('Missing backup version')
  }

  if (!backup.timestamp) {
    errors.push('Missing backup timestamp')
  }

  if (!backup.userId) {
    errors.push('Missing user ID')
  }

  if (!backup.data) {
    errors.push('Missing data object')
    return {
      isValid: false,
      errors,
      warnings,
      stats,
      missingTables: expectedTables,
      emptyTables: expectedTables,
    }
  }

  // Check each expected table
  for (const table of expectedTables) {
    const tableData = (backup.data as any)[table]

    if (tableData === undefined) {
      missingTables.push(table)
      errors.push(`Missing table: ${table}`)
      stats[table] = { count: 0, hasData: false }
    } else {
      // All other tables should be arrays
      if (!Array.isArray(tableData)) {
        errors.push(`Invalid ${table} data (expected array, got ${typeof tableData})`)
        stats[table] = { count: 0, hasData: false }
      } else {
        const count = tableData.length
        stats[table] = { count, hasData: count > 0 }
        
        if (count === 0) {
          emptyTables.push(table)
          // Some tables might legitimately be empty, so this is a warning, not an error
          warnings.push(`${table} is empty (this may be normal if you haven't used this feature yet)`)
        }
      }
    }
  }

  // Verify critical data relationships
  if (stats.projects?.hasData) {
    const projectIds = new Set((backup.data.projects || []).map((p: any) => p.id))
    
    // Check if estimates reference valid projects
    if (stats.estimates?.hasData) {
      const estimates = backup.data.estimates || []
      const invalidEstimates = estimates.filter((e: any) => 
        e.project_id && !projectIds.has(e.project_id)
      )
      if (invalidEstimates.length > 0) {
        warnings.push(`${invalidEstimates.length} estimate(s) reference non-existent projects`)
      }
    }

    // Check if trades reference valid estimates
    if (stats.trades?.hasData) {
      const trades = backup.data.trades || []
      const estimateIds = new Set((backup.data.estimates || []).map((e: any) => e.id))
      const invalidTrades = trades.filter((t: any) => 
        t.estimate_id && !estimateIds.has(t.estimate_id)
      )
      if (invalidTrades.length > 0) {
        warnings.push(`${invalidTrades.length} trade(s) reference non-existent estimates`)
      }
    }

    // Check if project documents reference valid projects
    if (stats.projectDocuments?.hasData) {
      const documents = backup.data.projectDocuments || []
      const invalidDocs = documents.filter((d: any) => 
        d.project_id && !projectIds.has(d.project_id)
      )
      if (invalidDocs.length > 0) {
        warnings.push(`${invalidDocs.length} project document(s) reference non-existent projects`)
      }
    }
  }

  // Check if deals reference valid organization
  if (stats.deals?.hasData) {
    const deals = backup.data.deals || []
    const orgId = backup.organizationId
    const dealsWithWrongOrg = deals.filter((d: any) => 
      orgId && d.organization_id !== orgId
    )
    if (dealsWithWrongOrg.length > 0) {
      warnings.push(`${dealsWithWrongOrg.length} deal(s) have different organization_id than backup`)
    }
  }

  // Check if deal notes reference valid deals
  if (stats.dealNotes?.hasData && stats.deals?.hasData) {
    const dealNotes = backup.data.dealNotes || []
    const dealIds = new Set((backup.data.deals || []).map((d: any) => d.id))
    const invalidNotes = dealNotes.filter((n: any) => 
      n.deal_id && !dealIds.has(n.deal_id)
    )
    if (invalidNotes.length > 0) {
      warnings.push(`${invalidNotes.length} deal note(s) reference non-existent deals`)
    }
  }

  // Check if quote requests reference valid projects
  if (stats.quoteRequests?.hasData && stats.projects?.hasData) {
    const quoteRequests = backup.data.quoteRequests || []
    const projectIds = new Set((backup.data.projects || []).map((p: any) => p.id))
    const invalidQuotes = quoteRequests.filter((q: any) => 
      q.project_id && !projectIds.has(q.project_id)
    )
    if (invalidQuotes.length > 0) {
      warnings.push(`${invalidQuotes.length} quote request(s) reference non-existent projects`)
    }
  }

  const isValid = errors.length === 0

  return {
    isValid,
    errors,
    warnings,
    stats,
    missingTables,
    emptyTables,
  }
}

/**
 * Print verification results in a readable format
 */
export function printVerificationResults(result: VerificationResult): void {
  console.log('\n' + '='.repeat(60))
  console.log('📋 BACKUP VERIFICATION RESULTS')
  console.log('='.repeat(60))

  if (result.isValid) {
    console.log('✅ Backup structure is VALID')
  } else {
    console.log('❌ Backup structure has ERRORS')
  }

  console.log('\n📊 Data Statistics:')
  console.log('-'.repeat(60))
  for (const [table, stat] of Object.entries(result.stats)) {
    const icon = stat.hasData ? '✅' : '⚠️'
    console.log(`${icon} ${table.padEnd(30)} ${stat.count.toString().padStart(6)} records`)
  }

  if (result.errors.length > 0) {
    console.log('\n❌ ERRORS:')
    console.log('-'.repeat(60))
    result.errors.forEach((error, i) => {
      console.log(`${i + 1}. ${error}`)
    })
  }

  if (result.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:')
    console.log('-'.repeat(60))
    result.warnings.forEach((warning, i) => {
      console.log(`${i + 1}. ${warning}`)
    })
  }

  if (result.emptyTables.length > 0) {
    console.log('\n📭 Empty Tables (may be normal):')
    console.log('-'.repeat(60))
    result.emptyTables.forEach((table) => {
      console.log(`  - ${table}`)
    })
  }

  console.log('\n' + '='.repeat(60))
}

/**
 * Verify backup from a file (for use in browser console or Node.js)
 */
export async function verifyBackupFromFile(file: File): Promise<VerificationResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const backup = JSON.parse(e.target?.result as string) as BackupData
        const result = verifyBackup(backup)
        printVerificationResults(result)
        resolve(result)
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


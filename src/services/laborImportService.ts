/**
 * Labor import from QuickBooks (Phase 1): wage config, burden rate, import batches.
 */

import { supabase, isOnlineMode } from '@/lib/supabase'

export interface QboWageConfig {
  organizationId: string
  accountIds: string[]
  /** Account IDs that are wages but 1099 / no burden (e.g. 198). */
  accountIdsNoBurden: string[]
  updatedAt: Date
}

export interface LaborBurdenRate {
  id: string
  method: 'percent' | 'per_hour'
  value: number
  effectiveDate: string
  isActive: boolean
}

export interface LaborImportBatch {
  id: string
  sourceSystem: string
  periodStart: string | null
  periodEnd: string | null
  rowCount: number
  totalWages: number
  errorCount: number
  status: 'completed' | 'failed'
  createdAt: Date
}

/** Get current user's organization id (for RLS-scoped tables we often don't need to pass it). */
async function getCurrentOrgId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'default-org'
  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
  return profile?.organization_id ?? 'default-org'
}

/** Fetch QBO wage allocation config for the current org. Returns null if not set. */
export async function getQboWageConfig(): Promise<QboWageConfig | null> {
  if (!isOnlineMode()) return null
  const { data, error } = await supabase
    .from('qbo_wage_allocation_config')
    .select('organization_id, account_ids, account_ids_no_burden, updated_at')
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return {
    organizationId: data.organization_id,
    accountIds: Array.isArray(data.account_ids) ? data.account_ids : [],
    accountIdsNoBurden: Array.isArray(data.account_ids_no_burden) ? data.account_ids_no_burden : [],
    updatedAt: new Date(data.updated_at),
  }
}

/** Save QBO wage allocation account IDs (and optional no-burden IDs) for the current org. */
export async function saveQboWageConfig(
  accountIds: string[],
  accountIdsNoBurden?: string[]
): Promise<{ ok: boolean; error?: string }> {
  if (!isOnlineMode()) return { ok: false, error: 'Offline' }
  const orgId = await getCurrentOrgId()
  const payload: Record<string, unknown> = {
    organization_id: orgId,
    account_ids: accountIds.filter(Boolean).map((s) => s.trim()),
    updated_at: new Date().toISOString(),
  }
  if (accountIdsNoBurden !== undefined) {
    payload.account_ids_no_burden = accountIdsNoBurden.filter(Boolean).map((s) => s.trim())
  }
  const { error } = await supabase.from('qbo_wage_allocation_config').upsert(payload, { onConflict: 'organization_id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Get the active global labor burden rate (employee_class_id null), latest effective_date. */
export async function getLaborBurdenGlobalRate(): Promise<LaborBurdenRate | null> {
  if (!isOnlineMode()) return null
  const { data, error } = await supabase
    .from('labor_burden_rates')
    .select('id, method, value, effective_date, is_active')
    .is('employee_class_id', null)
    .eq('is_active', true)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return {
    id: data.id,
    method: data.method as 'percent' | 'per_hour',
    value: Number(data.value),
    effectiveDate: data.effective_date,
    isActive: data.is_active,
  }
}

/** Create a new global labor burden rate (percent of wages). */
export async function createLaborBurdenGlobalRate(percent: number, effectiveDate: string): Promise<boolean> {
  if (!isOnlineMode()) return false
  const orgId = await getCurrentOrgId()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { error } = await supabase.from('labor_burden_rates').insert({
    organization_id: orgId,
    employee_class_id: null,
    method: 'percent',
    value: percent,
    effective_date: effectiveDate,
    is_active: true,
  })
  return !error
}

/** Set the global labor burden rate: deactivate any existing global rate, then insert new (one active rate per org). */
export async function setLaborBurdenGlobalRate(percent: number, effectiveDate: string): Promise<boolean> {
  if (!isOnlineMode()) return false
  const orgId = await getCurrentOrgId()
  const { error: updateErr } = await supabase
    .from('labor_burden_rates')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('organization_id', orgId)
    .is('employee_class_id', null)
  if (updateErr) return false
  const { error: insertErr } = await supabase.from('labor_burden_rates').insert({
    organization_id: orgId,
    employee_class_id: null,
    method: 'percent',
    value: percent,
    effective_date: effectiveDate,
    is_active: true,
  })
  return !insertErr
}

/** List recent labor import batches for the current org. */
export async function getLaborImportBatches(limit = 10): Promise<LaborImportBatch[]> {
  if (!isOnlineMode()) return []
  const { data, error } = await supabase
    .from('labor_import_batches')
    .select('id, source_system, period_start, period_end, row_count, total_wages, error_count, status, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return data.map((row) => ({
    id: row.id,
    sourceSystem: row.source_system,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    rowCount: row.row_count ?? 0,
    totalWages: Number(row.total_wages ?? 0),
    errorCount: row.error_count ?? 0,
    status: (row.status === 'failed' ? 'failed' : 'completed') as 'completed' | 'failed',
    createdAt: new Date(row.created_at),
  }))
}

export interface ImportLaborResult {
  success: boolean
  batchId?: string
  rowCount?: number
  totalWages?: number
  errorCount?: number
  /** First DB/upsert error when rowCount is 0 (helps debug import failures) */
  firstError?: string
  error?: string
}

export interface LaborPreviewResult {
  success: boolean
  error?: string
  journalEntriesFound?: number
  matchingWageLines?: number
  totalGrossWages?: number
  distinctProjectsAffected?: number
}

/** Preview labor import: fetch JEs and return counts (no DB writes). */
export async function previewLaborFromQBO(dateStart: string, dateEnd: string): Promise<LaborPreviewResult> {
  if (!isOnlineMode()) {
    return { success: false, error: 'Preview is only available when online.' }
  }
  const { data, error } = await supabase.functions.invoke('qb-import-labor', {
    body: { dateStart, dateEnd, preview: true },
  })
  if (error) {
    return { success: false, error: error.message || 'Preview failed' }
  }
  const d = (data as any)?.data ?? data
  const err = (d as any)?.error
  if (err) {
    return { success: false, error: typeof err === 'string' ? err : JSON.stringify(err) }
  }
  const preview = (d as any)?.preview === true
  const hasCounts =
    typeof (d as any)?.journalEntriesFound === 'number' && typeof (d as any)?.matchingWageLines === 'number'
  if (!preview && !hasCounts) {
    return { success: false, error: (d as any)?.error ?? 'Unexpected response from preview' }
  }
  return {
    success: true,
    journalEntriesFound: (d as any)?.journalEntriesFound ?? 0,
    matchingWageLines: (d as any)?.matchingWageLines ?? 0,
    totalGrossWages: (d as any)?.totalGrossWages ?? 0,
    distinctProjectsAffected: (d as any)?.distinctProjectsAffected ?? 0,
  }
}

/** Invoke edge function to import labor from QBO Journal Entries for the given date range. */
export async function importLaborFromQBO(dateStart: string, dateEnd: string): Promise<ImportLaborResult> {
  if (!isOnlineMode()) {
    return { success: false, error: 'Import is only available when online.' }
  }
  const { data, error } = await supabase.functions.invoke('qb-import-labor', {
    body: { dateStart, dateEnd },
  })
  if (error) {
    return { success: false, error: error.message || 'Import failed' }
  }
  const d = (data as any)?.data ?? data
  const err = (d as any)?.error
  if (err) {
    return { success: false, error: typeof err === 'string' ? err : JSON.stringify(err) }
  }
  return {
    success: true,
    batchId: (d as any)?.batchId,
    rowCount: (d as any)?.rowCount ?? 0,
    totalWages: (d as any)?.totalWages ?? 0,
    errorCount: (d as any)?.errorCount ?? 0,
    firstError: (d as any)?.firstError,
  }
}

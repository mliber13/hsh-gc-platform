// ============================================================================
// HR Payroll service — pay_periods per-id upsert + read-own RPCs
// ============================================================================

import { supabase, isOnlineMode } from '@/lib/supabase'
import type { MyPaystub, PayPeriod, PayrollEntry } from '@/types/payroll'
import { requireUserOrgId } from './userService'

export class HrPayrollPermissionError extends Error {
  constructor(message = 'You do not have permission to manage payroll.') {
    super(message)
    this.name = 'HrPayrollPermissionError'
  }
}

export class PayPeriodStaleError extends Error {
  constructor(
    message = 'This payroll run changed somewhere else. Reload and try again.',
  ) {
    super(message)
    this.name = 'PayPeriodStaleError'
  }
}

export class PayPeriodLockedError extends Error {
  constructor(message = 'This payroll run is locked. Unlock it before saving.') {
    super(message)
    this.name = 'PayPeriodLockedError'
  }
}

export interface PayrollWriteResult {
  updatedAtRaw?: string
}

const payPeriodWriteListeners = new Set<() => void>()

/** PayrollPage subscribes so audit/modal writes refresh `runs` (and the Run-tab held timestamp). */
export function subscribePayPeriodWrites(listener: () => void): () => void {
  payPeriodWriteListeners.add(listener)
  return () => {
    payPeriodWriteListeners.delete(listener)
  }
}

function notifyPayPeriodWrites() {
  for (const listener of payPeriodWriteListeners) listener()
}

function requireRawUpdatedAt(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Pay period is missing updated_at')
  }
  return value
}

function isRlsOrPermissionError(error: { code?: string; message?: string }): boolean {
  const code = error.code ?? ''
  const msg = (error.message ?? '').toLowerCase()
  return (
    code === '42501' ||
    code === 'PGRST301' ||
    msg.includes('permission') ||
    msg.includes('row-level security') ||
    msg.includes('violates row-level')
  )
}

function mapPayPeriodRow(row: {
  id: string
  payload: unknown
  updated_at?: string
}): PayPeriod {
  const payload =
    row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {}
  return {
    ...(payload as Omit<PayPeriod, 'id'>),
    id: row.id,
    entries: Array.isArray(payload.entries) ? (payload.entries as PayPeriod['entries']) : [],
    startDate: String(payload.startDate ?? ''),
    endDate: String(payload.endDate ?? ''),
    updated_at: row.updated_at,
  }
}

export async function fetchPayPeriods(): Promise<PayPeriod[]> {
  if (!isOnlineMode()) {
    throw new Error('Payroll requires an online connection to Supabase.')
  }

  const organizationId = await requireUserOrgId()

  const { data, error } = await supabase
    .from('pay_periods')
    .select('id, payload, updated_at')
    .eq('organization_id', organizationId)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('fetchPayPeriods:', error)
    if (isRlsOrPermissionError(error)) throw new HrPayrollPermissionError()
    throw new Error(error.message || 'Failed to load pay periods')
  }

  return (data ?? []).map(mapPayPeriodRow)
}

/** Set of personIds that appear in ANY pay_period's entries — deleting these would orphan pay history. */
export async function getPersonIdsWithPayrollHistory(): Promise<Set<string>> {
  const periods = await fetchPayPeriods()
  const ids = new Set<string>()
  for (const p of periods) {
    for (const e of p.entries || []) {
      if (e.personId) ids.add(String(e.personId))
    }
  }
  return ids
}

export async function fetchMyPaystubs(): Promise<MyPaystub[]> {
  if (!isOnlineMode()) return []

  const { data, error } = await supabase.rpc('list_my_paystubs')
  if (error) {
    console.error('fetchMyPaystubs:', error)
    throw new Error(error.message || 'Failed to load paystubs')
  }

  if (!Array.isArray(data)) return []
  return data as MyPaystub[]
}

export async function fetchMyPaystubEntries(periodId: string): Promise<PayrollEntry[]> {
  if (!isOnlineMode()) return []

  const { data, error } = await supabase.rpc('get_my_paystub_entries', {
    p_period_id: periodId,
  })
  if (error) {
    console.error('fetchMyPaystubEntries:', error)
    throw new Error(error.message || 'Failed to load paystub entries')
  }

  if (!Array.isArray(data)) return []
  return data as PayrollEntry[]
}

function mapPayPeriodWriteError(error: { code?: string; message?: string }): never {
  const msg = error.message ?? ''
  if (msg.includes('pay_period_stale') || msg.includes('pay_period_exists')) {
    throw new PayPeriodStaleError()
  }
  if (msg.includes('pay_period_locked')) {
    throw new PayPeriodLockedError()
  }
  if (msg.includes('pay_period_forbidden') || isRlsOrPermissionError(error)) {
    throw new HrPayrollPermissionError()
  }
  throw new Error(msg || 'Failed to save pay period')
}

export async function savePayPeriod(
  period: PayPeriod,
  previousPeriod?: PayPeriod | null,
): Promise<PayrollWriteResult> {
  if (!isOnlineMode()) {
    throw new Error('Payroll requires an online connection to Supabase.')
  }

  await requireUserOrgId()
  const { id, updated_at: expectedFromPeriod, ...payloadFields } = period
  const expectedRaw = expectedFromPeriod || previousPeriod?.updated_at || null

  const { data, error } = await supabase.rpc('save_pay_period', {
    p_id: id,
    p_payload: { ...payloadFields, id },
    p_expected_updated_at: expectedRaw,
  })

  if (error) {
    console.error('savePayPeriod:', error)
    mapPayPeriodWriteError(error)
  }

  const updatedAtRaw = requireRawUpdatedAt(data)
  notifyPayPeriodWrites()
  return { updatedAtRaw }
}

export async function deletePayPeriod(
  periodId: string,
  expectedUpdatedAt?: string | null,
): Promise<void> {
  if (!isOnlineMode()) {
    throw new Error('Payroll requires an online connection to Supabase.')
  }

  await requireUserOrgId()
  const expectedRaw = expectedUpdatedAt || null

  const { error } = await supabase.rpc('delete_pay_period', {
    p_id: periodId,
    p_expected_updated_at: expectedRaw,
  })

  if (error) {
    console.error('deletePayPeriod:', error)
    mapPayPeriodWriteError(error)
  }

  notifyPayPeriodWrites()
}

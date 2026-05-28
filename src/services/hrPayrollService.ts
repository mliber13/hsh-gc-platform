// ============================================================================
// HR Payroll service — pay_periods per-id upsert + read-own RPCs
// ============================================================================

import { supabase, isOnlineMode } from '@/lib/supabase'
import type { MyPaystub, PayPeriod, PayrollEntry } from '@/types/payroll'
import { prepareOrgTeamPayload } from '@/lib/hrTeamUtils'
import type { OrgTeamPayload } from '@/types/hr'
import { requireUserOrgId } from './userService'

export class HrPayrollPermissionError extends Error {
  constructor(message = 'You do not have permission to manage payroll.') {
    super(message)
    this.name = 'HrPayrollPermissionError'
  }
}

export interface PayrollWriteResult {
  teamSyncWarning?: string
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

function personKey(personId: string, personType: string): string {
  return personType === 'w2' ? `w2-${personId}` : `c-${personId}`
}

function entryHours(entry: PayrollEntry): number {
  const fromHourEntries = (entry.hourEntries || []).reduce(
    (sum, he) => sum + (parseFloat(String(he.hours)) || 0),
    0,
  )
  if (fromHourEntries > 0) return fromHourEntries
  return parseFloat(String(entry.hours)) || 0
}

function contributionFromEntry(entry: PayrollEntry): number {
  const used = parseFloat(String(entry.bankedHoursUsed)) || 0
  const hours = entryHours(entry)
  const banked = Math.min(parseFloat(String(entry.hoursToBank)) || 0, hours)
  return banked - used
}

function runContributionsByPerson(run: Pick<PayPeriod, 'entries'> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of run?.entries || []) {
    const key = personKey(e.personId, e.personType)
    out[key] = (out[key] || 0) + contributionFromEntry(e)
  }
  return out
}

function contributionDelta(
  nextRun: Pick<PayPeriod, 'entries'> | null | undefined,
  prevRun: Pick<PayPeriod, 'entries'> | null | undefined,
): Record<string, number> {
  const next = runContributionsByPerson(nextRun)
  const prev = runContributionsByPerson(prevRun)
  const keys = new Set([...Object.keys(next), ...Object.keys(prev)])
  const out: Record<string, number> = {}
  for (const key of keys) {
    const delta = (next[key] || 0) - (prev[key] || 0)
    if (delta !== 0) out[key] = delta
  }
  return out
}

async function applyBankedHoursDeltaToTeam(
  organizationId: string,
  deltaByPerson: Record<string, number>,
): Promise<void> {
  if (Object.keys(deltaByPerson).length === 0) return

  const { data, error } = await supabase
    .from('org_team')
    .select('payload')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message || 'Failed to load team for banked-hours update')
  }

  const payloadRaw = data?.payload && typeof data.payload === 'object' ? data.payload : {}
  const payload = prepareOrgTeamPayload(payloadRaw as OrgTeamPayload)

  const employees = payload.employees.map((emp) => {
    const delta = deltaByPerson[`w2-${emp.id}`] || 0
    if (!delta) return emp
    const current = parseFloat(String(emp.bankedHours)) || 0
    return { ...emp, bankedHours: Math.max(0, current + delta) }
  })

  const contractors1099 = payload.contractors1099.map((c) => {
    const delta = deltaByPerson[`c-${c.id}`] || 0
    if (!delta) return c
    const current = parseFloat(String(c.bankedHours)) || 0
    return { ...c, bankedHours: Math.max(0, current + delta) }
  })

  const { error: upsertError } = await supabase.from('org_team').upsert(
    {
      organization_id: organizationId,
      payload: {
        employees,
        contractors1099,
        positions: payload.positions,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' },
  )

  if (upsertError) {
    throw new Error(upsertError.message || 'Failed to save banked-hours team update')
  }
}

export async function savePayPeriod(
  period: PayPeriod,
  previousPeriod?: PayPeriod | null,
): Promise<PayrollWriteResult> {
  if (!isOnlineMode()) {
    throw new Error('Payroll requires an online connection to Supabase.')
  }

  const organizationId = await requireUserOrgId()
  const now = new Date().toISOString()
  const { id, updated_at: _u, ...payloadFields } = period

  const row = {
    id,
    organization_id: organizationId,
    payload: { ...payloadFields, id },
    updated_at: now,
  }

  const { error } = await supabase.from('pay_periods').upsert(row, { onConflict: 'id' })

  if (error) {
    console.error('savePayPeriod:', error)
    if (isRlsOrPermissionError(error)) throw new HrPayrollPermissionError()
    throw new Error(error.message || 'Failed to save pay period')
  }

  try {
    const delta = contributionDelta(period, previousPeriod)
    await applyBankedHoursDeltaToTeam(organizationId, delta)
    return {}
  } catch (teamError) {
    console.error('savePayPeriod banked-hours team sync:', teamError)
    return {
      teamSyncWarning:
        teamError instanceof Error
          ? teamError.message
          : 'Payroll saved, but banked-hours team balance update failed.',
    }
  }
}

export async function deletePayPeriod(
  periodId: string,
  deletedPeriod?: PayPeriod | null,
): Promise<PayrollWriteResult> {
  if (!isOnlineMode()) {
    throw new Error('Payroll requires an online connection to Supabase.')
  }

  const organizationId = await requireUserOrgId()

  const { error } = await supabase
    .from('pay_periods')
    .delete()
    .eq('id', periodId)
    .eq('organization_id', organizationId)

  if (error) {
    console.error('deletePayPeriod:', error)
    if (isRlsOrPermissionError(error)) throw new HrPayrollPermissionError()
    throw new Error(error.message || 'Failed to delete pay period')
  }

  try {
    const reverseDelta: Record<string, number> = {}
    for (const [key, value] of Object.entries(runContributionsByPerson(deletedPeriod))) {
      reverseDelta[key] = -value
    }
    await applyBankedHoursDeltaToTeam(organizationId, reverseDelta)
    return {}
  } catch (teamError) {
    console.error('deletePayPeriod banked-hours team sync:', teamError)
    return {
      teamSyncWarning:
        teamError instanceof Error
          ? teamError.message
          : 'Payroll run deleted, but banked-hours team balance update failed.',
    }
  }
}

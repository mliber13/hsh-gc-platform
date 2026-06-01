import { isOnlineMode, supabase } from '@/lib/supabase'
import type {
  PayrollTimeImportQuery,
  PayrollTimeImportRow,
  PunchState,
  TimeEntriesRangeQuery,
  TimeEntry,
  TimeEntryEditDraft,
  TimePersonType,
} from '@/types/hr'
import { requireUserOrgId, getCurrentUserProfile } from './userService'

const TIME_SELECT =
  'id, organization_id, project_id, project_name, person_type, person_id, person_name, clock_in, clock_out, source_app, created_by, created_at, updated_at'

export class HrTimePermissionError extends Error {
  constructor(message = 'You do not have permission for this time entry action.') {
    super(message)
    this.name = 'HrTimePermissionError'
  }
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

function mapRow(row: Record<string, unknown>): TimeEntry {
  return row as unknown as TimeEntry
}

async function resolvePersonName(orgId: string, personId: string, personType: TimePersonType) {
  const { data, error } = await supabase
    .from('org_team')
    .select('payload')
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error || !data?.payload || typeof data.payload !== 'object') return null

  const payload = data.payload as {
    employees?: Array<{ id?: string; name?: string }>
    contractors1099?: Array<{ id?: string; name?: string }>
  }
  const list = personType === 'w2' ? payload.employees ?? [] : payload.contractors1099 ?? []
  const found = list.find((m) => m.id === personId)
  return found?.name ?? null
}

async function resolveProjectName(projectId: string) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .maybeSingle()
  if (error) return null
  return data?.name ?? null
}

export async function clockIn(input: {
  personId: string
  personType: TimePersonType
  projectId?: string
}): Promise<TimeEntry> {
  if (!isOnlineMode()) throw new Error('Time Clock requires an online connection to Supabase.')
  const organizationId = await requireUserOrgId()
  const now = new Date().toISOString()
  const { data: auth } = await supabase.auth.getUser()

  const personName = await resolvePersonName(organizationId, input.personId, input.personType)
  const projectName = input.projectId ? await resolveProjectName(input.projectId) : null

  const row = {
    organization_id: organizationId,
    person_id: input.personId,
    person_type: input.personType,
    person_name: personName,
    project_id: input.projectId ?? null,
    project_name: projectName,
    clock_in: now,
    clock_out: null,
    source_app: 'GC',
    created_by: auth.user?.id ?? null,
    updated_at: now,
  }

  const { data, error } = await supabase.from('time_entries').insert(row).select(TIME_SELECT).single()
  if (error) {
    console.error('clockIn:', error)
    if (isRlsOrPermissionError(error)) throw new HrTimePermissionError()
    throw new Error(error.message || 'Failed to clock in')
  }
  return mapRow((data ?? {}) as Record<string, unknown>)
}

export async function clockOut(entryId: string): Promise<TimeEntry> {
  if (!isOnlineMode()) throw new Error('Time Clock requires an online connection to Supabase.')
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('time_entries')
    .update({ clock_out: now, source_app: 'GC', updated_at: now })
    .eq('id', entryId)
    .select(TIME_SELECT)
    .single()
  if (error) {
    console.error('clockOut:', error)
    if (isRlsOrPermissionError(error)) throw new HrTimePermissionError()
    throw new Error(error.message || 'Failed to clock out')
  }
  return mapRow((data ?? {}) as Record<string, unknown>)
}

export async function fetchMyOpenPunch(): Promise<PunchState> {
  if (!isOnlineMode()) return { linked: false, openEntry: null }
  const profile = await getCurrentUserProfile()
  const personId = profile?.hr_person_id ?? profile?.hrPersonId ?? null
  const personType = (profile?.hr_person_type ?? profile?.hrPersonType ?? null) as TimePersonType | null
  if (!personId || !personType) {
    return { linked: false, hrPersonId: personId, hrPersonType: personType, openEntry: null }
  }

  const organizationId = await requireUserOrgId()
  const { data, error } = await supabase
    .from('time_entries')
    .select(TIME_SELECT)
    .eq('organization_id', organizationId)
    .eq('person_id', personId)
    .eq('person_type', personType)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('fetchMyOpenPunch:', error)
    throw new Error(error.message || 'Failed to load your punch state')
  }
  return {
    linked: true,
    hrPersonId: personId,
    hrPersonType: personType,
    openEntry: data ? mapRow(data as Record<string, unknown>) : null,
  }
}

export async function fetchEntriesForRange(query: TimeEntriesRangeQuery): Promise<TimeEntry[]> {
  if (!isOnlineMode()) throw new Error('Time Clock requires an online connection to Supabase.')
  const organizationId = await requireUserOrgId()
  let q = supabase
    .from('time_entries')
    .select(TIME_SELECT)
    .eq('organization_id', organizationId)
    .gte('clock_in', `${query.from}T00:00:00`)
    .lte('clock_in', `${query.to}T23:59:59`)
    .order('clock_in', { ascending: false })

  if (query.personId) q = q.eq('person_id', query.personId)
  if (query.projectId) q = q.eq('project_id', query.projectId)

  const { data, error } = await q
  if (error) {
    console.error('fetchEntriesForRange:', error)
    throw new Error(error.message || 'Failed to load time entries')
  }
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>))
}

function diffHours(clockIn: string, clockOut: string | null | undefined): number {
  if (!clockOut) return 0
  const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return ms / (1000 * 60 * 60)
}

export async function fetchEntriesForPayrollImport(
  query: PayrollTimeImportQuery,
): Promise<PayrollTimeImportRow[]> {
  const entries = await fetchEntriesForRange({ from: query.start, to: query.end })
  const map = new Map<string, PayrollTimeImportRow>()
  for (const entry of entries) {
    const personName = entry.person_name || 'Unknown'
    const projectName = entry.project_name || 'Unassigned'
    const projectId = entry.project_id ?? null
    const hours = diffHours(entry.clock_in, entry.clock_out)
    if (hours <= 0) continue
    const key = `${entry.person_type}:${entry.person_id}:${projectId ?? 'none'}`
    const current = map.get(key)
    if (current) {
      current.hours += hours
    } else {
      map.set(key, {
        personId: entry.person_id,
        personType: entry.person_type,
        personName,
        projectId,
        projectName,
        hours,
      })
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.personName.localeCompare(b.personName) || a.projectName.localeCompare(b.projectName),
  )
}

export async function updateEntry(entryId: string, patch: TimeEntryEditDraft): Promise<TimeEntry> {
  if (!isOnlineMode()) throw new Error('Time Clock requires an online connection to Supabase.')
  const update = { ...patch, source_app: 'GC', updated_at: new Date().toISOString() }
  const { data, error } = await supabase
    .from('time_entries')
    .update(update)
    .eq('id', entryId)
    .select(TIME_SELECT)
    .single()
  if (error) {
    console.error('updateEntry:', error)
    if (isRlsOrPermissionError(error)) throw new HrTimePermissionError()
    throw new Error(error.message || 'Failed to update entry')
  }
  return mapRow((data ?? {}) as Record<string, unknown>)
}

export async function deleteEntry(entryId: string): Promise<void> {
  if (!isOnlineMode()) throw new Error('Time Clock requires an online connection to Supabase.')
  const { error } = await supabase
    .from('time_entries')
    .delete()
    .eq('id', entryId)
    .select('id')
    .single()
  if (error) {
    console.error('deleteEntry:', error)
    if (isRlsOrPermissionError(error)) throw new HrTimePermissionError()
    throw new Error(error.message || 'Failed to delete entry')
  }
}

// ============================================================================
// Org holidays + subcontractor unavailability (schedule cascade inputs)
// ============================================================================

import { supabase } from '@/lib/supabase'
import type { ScheduleDateMathOptions } from '@/lib/scheduleDateMath'
import type { ScheduleItem } from '@/types'
import { getCurrentUserProfile } from './userService'

export interface OrgHoliday {
  id: string
  date: string
  label: string
  created_at: string
}

export interface SubUnavailability {
  id: string
  subcontractor_id: string
  start_date: string
  end_date: string
  reason: string | null
  created_at: string
}

async function requireOrgId(): Promise<string> {
  const profile = await getCurrentUserProfile()
  if (!profile?.organization_id) throw new Error('No organization for current user')
  return profile.organization_id
}

export async function fetchOrgHolidays(): Promise<OrgHoliday[]> {
  const { data, error } = await supabase
    .from('org_holidays')
    .select('id, date, label, created_at')
    .order('date', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createOrgHoliday(input: { date: string; label: string }): Promise<OrgHoliday> {
  const organization_id = await requireOrgId()
  const { data, error } = await supabase
    .from('org_holidays')
    .insert({ organization_id, date: input.date, label: input.label.trim() })
    .select('id, date, label, created_at')
    .single()
  if (error) throw error
  return data
}

export async function deleteOrgHoliday(id: string): Promise<void> {
  const { error } = await supabase.from('org_holidays').delete().eq('id', id)
  if (error) throw error
}

export async function fetchSubUnavailability(
  subcontractorIds?: string[],
): Promise<SubUnavailability[]> {
  let q = supabase
    .from('subcontractor_unavailability')
    .select('id, subcontractor_id, start_date, end_date, reason, created_at')
    .order('start_date', { ascending: true })
  if (subcontractorIds && subcontractorIds.length > 0) {
    q = q.in('subcontractor_id', subcontractorIds)
  }
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function createSubUnavailability(input: {
  subcontractor_id: string
  start_date: string
  end_date: string
  reason?: string | null
}): Promise<SubUnavailability> {
  const organization_id = await requireOrgId()
  const { data, error } = await supabase
    .from('subcontractor_unavailability')
    .insert({
      organization_id,
      subcontractor_id: input.subcontractor_id,
      start_date: input.start_date,
      end_date: input.end_date,
      reason: input.reason?.trim() || null,
    })
    .select('id, subcontractor_id, start_date, end_date, reason, created_at')
    .single()
  if (error) throw error
  return data
}

export async function deleteSubUnavailability(id: string): Promise<void> {
  const { error } = await supabase.from('subcontractor_unavailability').delete().eq('id', id)
  if (error) throw error
}

/** Build cascade math options from org holidays + subs assigned on the schedule. */
export async function fetchCascadeDateMathOptions(
  items: ReadonlyArray<Pick<ScheduleItem, 'assignedCompanyId'>>,
): Promise<ScheduleDateMathOptions> {
  const subcontractorIds = Array.from(
    new Set(
      items
        .map((item) => item.assignedCompanyId)
        .filter((id): id is string => Boolean(id)),
    ),
  )

  const [holidayRows, unavailRows] = await Promise.all([
    fetchOrgHolidays(),
    fetchSubUnavailability(subcontractorIds.length > 0 ? subcontractorIds : undefined),
  ])

  return {
    holidays: holidayRows.map((h) => h.date),
    unavailability: unavailRows.map((u) => ({
      companyId: u.subcontractor_id,
      start: u.start_date,
      end: u.end_date,
    })),
  }
}

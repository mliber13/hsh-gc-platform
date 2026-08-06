import { isOnlineMode, supabase } from '@/lib/supabase'
import { requireUserOrgId } from '@/services/userService'

export type ScheduleUnavailability = {
  id: string
  personId: string
  personName: string
  startDate: string
  endDate: string
  reason: string | null
}

type Row = {
  id: string
  person_id: string
  person_name: string | null
  start_date: string
  end_date: string
  reason: string | null
}

const SELECT = 'id, person_id, person_name, start_date, end_date, reason'

export async function fetchPersonUnavailability(): Promise<ScheduleUnavailability[]> {
  if (!isOnlineMode()) return []
  const { data, error } = await supabase
    .from('person_unavailability')
    .select(SELECT)
    .order('start_date', { ascending: true })
  if (error) {
    console.error('fetchPersonUnavailability:', error)
    return []
  }
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    personId: r.person_id,
    personName: r.person_name?.trim() || 'Crew member',
    startDate: r.start_date,
    endDate: r.end_date,
    reason: r.reason,
  }))
}

export async function addPersonUnavailability(input: {
  personId: string
  personName: string
  startDate: string
  endDate: string
  reason?: string
}): Promise<void> {
  if (!isOnlineMode()) throw new Error('Time off requires an online connection.')
  const organizationId = await requireUserOrgId()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { error } = await supabase.from('person_unavailability').insert({
    organization_id: organizationId,
    person_id: input.personId,
    person_name: input.personName,
    start_date: input.startDate.slice(0, 10),
    end_date: (input.endDate || input.startDate).slice(0, 10),
    reason: input.reason?.trim() || null,
    created_by: user?.id ?? null,
  })
  if (error) {
    console.error('addPersonUnavailability:', error)
    throw new Error(error.message || 'Could not save time off')
  }
}

export async function deletePersonUnavailability(id: string): Promise<void> {
  if (!isOnlineMode()) throw new Error('Time off requires an online connection.')
  const { error } = await supabase.from('person_unavailability').delete().eq('id', id)
  if (error) {
    console.error('deletePersonUnavailability:', error)
    throw new Error(error.message || 'Could not delete time off')
  }
}

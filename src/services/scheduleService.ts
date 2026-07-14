import { differenceInCalendarDays, parseISO } from 'date-fns'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase'
import { cascadeSchedule, workdaysBetween } from '@/lib/scheduleDateMath'
import type { ConfirmationStatus } from '@/types'
import type { ScheduleItem } from '@/types'
import { isVisibleInGcApp } from './projectVisibility'
import { requireUserOrgId } from './userService'

export type PortfolioTypeFilter = 'all' | 'gc' | 'drywall'

export interface PortfolioFilters {
  startDate: string
  endDate: string
  typeFilter: PortfolioTypeFilter
}

export interface PortfolioProject {
  id: string
  name: string
  type: string | null
  app_scope: string | null
}

export interface PortfolioItem {
  id: string
  project_id: string
  schedule_id: string
  name: string
  start_date: string
  end_date: string
  confirmation_status: ConfirmationStatus
  confirmation_notes: string | null
  status: 'not-started' | 'in-progress' | 'complete' | 'delayed'
  assigned_company_id: string | null
  assigned_company_name: string | null
  assigned_persons: string[]
  notes: string | null
}

type ProjectRow = {
  id: string
  name: string
  type: string | null
  metadata: Record<string, unknown> | null
}

type PortfolioItemRow = {
  id: string
  project_id: string
  schedule_id: string
  name: string
  start_date: string
  end_date: string
  confirmation_status: ConfirmationStatus | null
  confirmation_notes: string | null
  status: 'not-started' | 'in-progress' | 'complete' | 'delayed' | null
  assigned_company_id: string | null
  assigned_persons: string[] | null
  notes: string | null
  subcontractors?: { name: string | null } | Array<{ name: string | null }> | null
}

function assignedCompanyName(
  subcontractors: PortfolioItemRow['subcontractors'],
): string | null {
  if (Array.isArray(subcontractors)) return subcontractors[0]?.name ?? null
  return subcontractors?.name ?? null
}

export async function fetchPortfolioProjects(
  typeFilter: PortfolioTypeFilter,
): Promise<PortfolioProject[]> {
  const organizationId = await requireUserOrgId()
  let query = supabase
    .from('projects')
    .select('id, name, type, metadata')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (typeFilter === 'drywall') {
    query = query.or('type.eq.drywall,metadata->>app_scope.eq.DRYWALL_ONLY')
  } else {
    query = query.or(
      'metadata->>app_scope.is.null,metadata->>app_scope.neq.DRYWALL_ONLY',
    )
  }

  const { data, error } = await query
  if (error) throw error

  let rows = (data ?? []) as ProjectRow[]
  if (typeFilter !== 'drywall') {
    rows = rows.filter((row) =>
      isVisibleInGcApp((row.metadata ?? {}) as Record<string, unknown>),
    )
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    app_scope:
      typeof row.metadata?.app_scope === 'string' ? row.metadata.app_scope : null,
  }))
}

export async function fetchPortfolioScheduleItems(
  projectIds: string[],
  startDate: string,
  endDate: string,
): Promise<PortfolioItem[]> {
  if (projectIds.length === 0) return []

  const { data, error } = await supabase
    .from('schedule_items')
    .select(
      'id, project_id, schedule_id, name, start_date, end_date, confirmation_status, confirmation_notes, status, assigned_company_id, assigned_persons, notes, subcontractors:assigned_company_id(name)',
    )
    .in('project_id', projectIds)
    .lte('start_date', endDate)
    .gte('end_date', startDate)
    .order('start_date', { ascending: true })

  if (error) throw error

  return ((data ?? []) as PortfolioItemRow[]).map((item) => ({
    id: item.id,
    project_id: item.project_id,
    schedule_id: item.schedule_id,
    name: item.name,
    start_date: item.start_date,
    end_date: item.end_date,
    confirmation_status: item.confirmation_status ?? 'unsent',
    confirmation_notes: item.confirmation_notes,
    status: item.status ?? 'not-started',
    assigned_company_id: item.assigned_company_id,
    assigned_company_name: assignedCompanyName(item.subcontractors),
    assigned_persons: item.assigned_persons ?? [],
    notes: item.notes,
  }))
}

export interface ActiveSubcontractor {
  id: string
  name: string
  is_internal: boolean
}

export async function fetchActiveSubcontractors(): Promise<ActiveSubcontractor[]> {
  const { data, error } = await supabase
    .from('subcontractors')
    .select('id, name, is_internal')
    .eq('is_active', true)
    .order('is_internal', { ascending: false })
    .order('name', { ascending: true })

  if (error) throw error
  return data ?? []
}

// ============================================================================
// D.6.4 — Per-project drywall schedule CRUD + cascade
// ============================================================================

export type DrywallScheduleItemStatus = 'not-started' | 'in-progress' | 'complete' | 'delayed'

export interface DrywallProjectScheduleItem {
  id: string
  project_id: string
  schedule_id: string
  name: string
  type: 'field' | 'office'
  start_date: string
  end_date: string
  duration: number
  status: DrywallScheduleItemStatus
  notes: string | null
  assigned_persons: string[]
  /** Subset of assigned_persons who see job info (sqft/pay/materials) in /crew. */
  show_job_info_person_ids: string[]
  assigned_company_id: string | null
  predecessor_ids: string[]
  lag_work_days: number
}

export interface NewScheduleItemInput {
  name: string
  type: 'field' | 'office'
  startDate: string
  endDate: string
  status?: DrywallScheduleItemStatus
  notes?: string
  assignedPersons?: string[]
  showJobInfoPersonIds?: string[]
  assignedCompanyId?: string | null
  predecessorIds?: string[]
  lagWorkDays?: number
}

type DrywallScheduleItemRow = {
  id: string
  project_id: string
  schedule_id: string
  name: string
  type: 'field' | 'office'
  start_date: string
  end_date: string
  duration: number
  confirmation_status: ConfirmationStatus | null
  confirmation_notes: string | null
  status: DrywallScheduleItemStatus | null
  assigned_company_id: string | null
  assigned_persons: string[] | null
  show_job_info_person_ids: string[] | null
  notes: string | null
  predecessors: Array<{ predecessor_id?: string; lag_days?: number }> | null
}

function toDateOnly(value: string): string {
  return value.slice(0, 10)
}

function durationFromDateRange(startDate: string, endDate: string): number {
  const start = parseISO(toDateOnly(startDate))
  const end = parseISO(toDateOnly(endDate))
  // Drywall duration = work days inclusive (Jun 18 → Jun 29 with M-F workweek = 8).
  return Math.max(1, workdaysBetween(start, end))
}

function parsePredecessors(
  raw: DrywallScheduleItemRow['predecessors'],
): { ids: string[]; lag: number } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ids: [], lag: 1 }
  }
  const ids = raw
    .map((p) => p.predecessor_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  const lag = Number.isFinite(raw[0]?.lag_days) ? Number(raw[0]?.lag_days) : 1
  return { ids, lag }
}

function predecessorsToRows(ids: string[], lagWorkDays: number) {
  return ids.map((predecessor_id) => ({
    predecessor_id,
    lag_days: lagWorkDays,
  }))
}

function mapDrywallScheduleRow(row: DrywallScheduleItemRow): DrywallProjectScheduleItem {
  const { ids, lag } = parsePredecessors(row.predecessors)
  const assigned = row.assigned_persons ?? []
  const showInfo = row.show_job_info_person_ids ?? []
  return {
    id: row.id,
    project_id: row.project_id,
    schedule_id: row.schedule_id,
    name: row.name,
    type: row.type === 'office' ? 'office' : 'field',
    start_date: toDateOnly(row.start_date),
    end_date: toDateOnly(row.end_date),
    duration: row.duration ?? 1,
    status: row.status ?? 'not-started',
    notes: row.notes,
    assigned_persons: assigned,
    show_job_info_person_ids: showInfo.filter((id) => assigned.includes(id)),
    assigned_company_id: row.assigned_company_id,
    predecessor_ids: ids,
    lag_work_days: lag,
  }
}

function toScheduleItemModel(item: DrywallProjectScheduleItem): ScheduleItem {
  return {
    id: item.id,
    scheduleId: item.schedule_id,
    type: item.type,
    name: item.name,
    startDate: parseISO(item.start_date),
    endDate: parseISO(item.end_date),
    duration: item.duration,
    predecessorIds: item.predecessor_ids,
    predecessors: item.predecessor_ids.map((predecessorId) => ({
      predecessorId,
      lagDays: item.lag_work_days,
    })),
    status: item.status,
    percentComplete: item.status === 'complete' ? 100 : 0,
    confirmation_status: 'unsent',
    assignedPersons: item.assigned_persons,
    assignedCompanyId: item.assigned_company_id,
    assignedTo: [],
    notes: item.notes ?? undefined,
  }
}

async function getOrCreateScheduleForProject(
  projectId: string,
  organizationId: string,
): Promise<string> {
  const { data: existing, error: fetchError } = await supabase
    .from('schedules')
    .select('id')
    .eq('project_id', projectId)
    .maybeSingle()

  if (fetchError) throw fetchError
  if (existing?.id) return existing.id

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const start = new Date().toISOString().slice(0, 10)
  const end = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: inserted, error: insertError } = await supabase
    .from('schedules')
    .insert({
      project_id: projectId,
      user_id: user?.id ?? null,
      organization_id: organizationId,
      start_date: start,
      end_date: end,
    })
    .select('id')
    .single()

  if (insertError) throw insertError
  return inserted.id as string
}

const DRYWALL_SCHEDULE_SELECT =
  'id, project_id, schedule_id, name, type, start_date, end_date, duration, confirmation_status, confirmation_notes, status, assigned_company_id, assigned_persons, show_job_info_person_ids, notes, predecessors'

export async function fetchScheduleItemsForDrywallProject(
  projectId: string,
): Promise<DrywallProjectScheduleItem[]> {
  const organizationId = await requireUserOrgId()

  const { data, error } = await supabase
    .from('schedule_items')
    .select(DRYWALL_SCHEDULE_SELECT)
    .eq('project_id', projectId)
    .eq('organization_id', organizationId)
    .order('start_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return ((data ?? []) as DrywallScheduleItemRow[]).map(mapDrywallScheduleRow)
}

export class DrywallScheduleCascadeError extends Error {
  cycle?: string[]

  constructor(message: string, cycle?: string[]) {
    super(message)
    this.name = 'DrywallScheduleCascadeError'
    this.cycle = cycle
  }
}

async function persistCascadedDates(items: ScheduleItem[]): Promise<void> {
  await Promise.all(
    items.map((item) =>
      supabase
        .from('schedule_items')
        .update({
          start_date: toDateOnly(item.startDate.toISOString()),
          end_date: toDateOnly(item.endDate.toISOString()),
          duration: item.duration,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id),
    ),
  )
}

async function runCascadeForProject(projectId: string): Promise<void> {
  const items = await fetchScheduleItemsForDrywallProject(projectId)
  if (items.length === 0) return

  const models = items.map(toScheduleItemModel)
  // Drywall uses parallel-zero semantic: lag=0 = same day as predecessor (Stock + Scaffold/Prep pattern).
  const result = cascadeSchedule(models, { lagSemantic: 'parallel-zero' })

  if (result.cycle) {
    throw new DrywallScheduleCascadeError(
      'Schedule has a circular dependency — review predecessors',
      result.cycle,
    )
  }

  if (result.changes.length > 0) {
    await persistCascadedDates(result.items)
  }
}

function buildInsertRow(
  input: NewScheduleItemInput,
  ids: { itemId: string; scheduleId: string; projectId: string; organizationId: string },
) {
  const start = toDateOnly(input.startDate)
  const end = toDateOnly(input.endDate || input.startDate)
  const predecessorIds = (input.predecessorIds ?? []).filter(Boolean)
  const lag = input.lagWorkDays ?? 1

  return {
    id: ids.itemId,
    schedule_id: ids.scheduleId,
    project_id: ids.projectId,
    organization_id: ids.organizationId,
    type: input.type,
    name: input.name.trim(),
    start_date: start,
    end_date: end,
    duration: durationFromDateRange(start, end),
    status: input.status ?? 'not-started',
    percent_complete: 0,
    confirmation_status: 'unsent' as ConfirmationStatus,
    assigned_persons: input.assignedPersons ?? [],
    show_job_info_person_ids: (input.showJobInfoPersonIds ?? input.assignedPersons ?? []).filter(
      (id) => (input.assignedPersons ?? []).includes(id),
    ),
    assigned_company_id: input.assignedCompanyId ?? null,
    assigned_to: [],
    predecessors: predecessorsToRows(predecessorIds, lag),
    notes: input.notes?.trim() || null,
  }
}

export async function createScheduleItemForDrywallProject(
  projectId: string,
  input: NewScheduleItemInput,
): Promise<DrywallProjectScheduleItem> {
  const organizationId = await requireUserOrgId()
  const scheduleId = await getOrCreateScheduleForProject(projectId, organizationId)
  const itemId = uuidv4()

  const { data, error } = await supabase
    .from('schedule_items')
    .insert(buildInsertRow(input, { itemId, scheduleId, projectId, organizationId }))
    .select(DRYWALL_SCHEDULE_SELECT)
    .single()

  if (error) throw error

  try {
    await runCascadeForProject(projectId)
  } catch (e) {
    if (e instanceof DrywallScheduleCascadeError) throw e
    throw e
  }

  const refreshed = await fetchScheduleItemsForDrywallProject(projectId)
  return refreshed.find((item) => item.id === itemId) ?? mapDrywallScheduleRow(data as DrywallScheduleItemRow)
}

export async function updateScheduleItemForDrywallProject(
  itemId: string,
  patch: Partial<NewScheduleItemInput>,
): Promise<void> {
  const organizationId = await requireUserOrgId()

  const { data: existing, error: fetchError } = await supabase
    .from('schedule_items')
    .select(DRYWALL_SCHEDULE_SELECT)
    .eq('id', itemId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (fetchError) throw fetchError
  if (!existing) throw new Error('Schedule item not found')

  const current = mapDrywallScheduleRow(existing as DrywallScheduleItemRow)
  const start = toDateOnly(patch.startDate ?? current.start_date)
  const end = toDateOnly(patch.endDate ?? current.end_date)
  const predecessorIds = patch.predecessorIds ?? current.predecessor_ids
  const lag = patch.lagWorkDays ?? current.lag_work_days

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (patch.name !== undefined) updatePayload.name = patch.name.trim()
  if (patch.type !== undefined) updatePayload.type = patch.type
  if (patch.startDate !== undefined || patch.endDate !== undefined) {
    updatePayload.start_date = start
    updatePayload.end_date = end
    updatePayload.duration = durationFromDateRange(start, end)
  }
  if (patch.status !== undefined) {
    updatePayload.status = patch.status
    updatePayload.percent_complete = patch.status === 'complete' ? 100 : 0
  }
  if (patch.notes !== undefined) updatePayload.notes = patch.notes.trim() || null
  if (patch.assignedPersons !== undefined) updatePayload.assigned_persons = patch.assignedPersons
  if (patch.showJobInfoPersonIds !== undefined) {
    const assigned = patch.assignedPersons ?? current.assigned_persons
    updatePayload.show_job_info_person_ids = patch.showJobInfoPersonIds.filter((id) =>
      assigned.includes(id),
    )
  } else if (patch.assignedPersons !== undefined) {
    // Keep show-info in sync when assignees change but toggle list wasn't sent.
    updatePayload.show_job_info_person_ids = current.show_job_info_person_ids.filter((id) =>
      patch.assignedPersons!.includes(id),
    )
  }
  if (patch.assignedCompanyId !== undefined) {
    updatePayload.assigned_company_id = patch.assignedCompanyId
  }
  if (patch.predecessorIds !== undefined || patch.lagWorkDays !== undefined) {
    updatePayload.predecessors = predecessorsToRows(predecessorIds, lag)
  }

  const { error } = await supabase
    .from('schedule_items')
    .update(updatePayload)
    .eq('id', itemId)
    .eq('organization_id', organizationId)

  if (error) throw error

  await runCascadeForProject(current.project_id)
}

/**
 * Remove deletedItemId from every sibling's predecessors JSONB on the same project.
 * Best-effort: one sibling update failing does not abort the others.
 */
async function stripDeletedPredecessorFromSiblings(
  projectId: string,
  organizationId: string,
  deletedItemId: string,
): Promise<void> {
  const { data: siblings, error: siblingsError } = await supabase
    .from('schedule_items')
    .select('id, predecessors')
    .eq('project_id', projectId)
    .eq('organization_id', organizationId)

  if (siblingsError) throw siblingsError
  if (!siblings?.length) return

  const now = new Date().toISOString()
  await Promise.all(
    siblings.map(async (row) => {
      const raw = row.predecessors
      if (!Array.isArray(raw) || raw.length === 0) return

      const next = raw.filter(
        (p) =>
          !(
            p &&
            typeof p === 'object' &&
            'predecessor_id' in p &&
            (p as { predecessor_id?: string }).predecessor_id === deletedItemId
          ),
      )
      if (next.length === raw.length) return

      const { error: updateError } = await supabase
        .from('schedule_items')
        .update({ predecessors: next, updated_at: now })
        .eq('id', row.id)
        .eq('organization_id', organizationId)

      if (updateError) {
        console.error(
          'Failed to strip deleted predecessor from schedule item',
          row.id,
          updateError,
        )
      }
    }),
  )
}

export async function deleteScheduleItemForDrywallProject(itemId: string): Promise<void> {
  const organizationId = await requireUserOrgId()

  const { data: existing, error: fetchError } = await supabase
    .from('schedule_items')
    .select('project_id')
    .eq('id', itemId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (fetchError) throw fetchError
  if (!existing) throw new Error('Schedule item not found')

  const projectId = existing.project_id as string

  const { error } = await supabase
    .from('schedule_items')
    .delete()
    .eq('id', itemId)
    .eq('organization_id', organizationId)

  if (error) throw error

  // Strip ghost predecessor refs before cascade so dependents stop pointing at the deleted id.
  await stripDeletedPredecessorFromSiblings(projectId, organizationId, itemId)

  try {
    await runCascadeForProject(projectId)
  } catch (e) {
    if (e instanceof DrywallScheduleCascadeError) {
      // Deleting cannot create cycles; ignore stale predecessor refs on remaining items.
      return
    }
    throw e
  }
}

const STANDARD_DRYWALL_TEMPLATE: Array<{
  name: string
  predecessorIndex: number | null
  lag: number
}> = [
  { name: 'Measure', predecessorIndex: null, lag: 0 },
  { name: 'Stock', predecessorIndex: 0, lag: 5 },
  { name: 'Scaffold / Prep', predecessorIndex: 1, lag: 0 },
  { name: 'Hang', predecessorIndex: 2, lag: 1 },
  { name: 'Finish', predecessorIndex: 3, lag: 1 },
  { name: 'Cleanout', predecessorIndex: 4, lag: 1 },
]

export async function generateStandardDrywallSchedule(
  projectId: string,
  measureDate: string,
): Promise<DrywallProjectScheduleItem[]> {
  const organizationId = await requireUserOrgId()
  const scheduleId = await getOrCreateScheduleForProject(projectId, organizationId)
  const start = toDateOnly(measureDate)

  const createdIds: string[] = []
  const rows = STANDARD_DRYWALL_TEMPLATE.map((step) => {
    const id = uuidv4()
    createdIds.push(id)
    const predecessorId =
      step.predecessorIndex != null ? createdIds[step.predecessorIndex] : null
    const predecessorIds = predecessorId ? [predecessorId] : []

    return buildInsertRow(
      {
        name: step.name,
        type: 'field',
        startDate: start,
        endDate: start,
        status: 'not-started',
        predecessorIds,
        lagWorkDays: step.lag,
      },
      { itemId: id, scheduleId, projectId, organizationId },
    )
  })

  const { error } = await supabase.from('schedule_items').insert(rows)
  if (error) throw error

  await runCascadeForProject(projectId)
  return fetchScheduleItemsForDrywallProject(projectId)
}

/**
 * Field foreman schedule persistence — client cascade + SECURITY DEFINER RPC.
 * Does NOT invoke scheduleCascadeDiff SMS / Twilio.
 */

import { supabase, isOnlineMode } from '@/lib/supabase'
import {
  buildCascadePreview,
  toRpcBatch,
  type ForemanCascadePreview,
  type ForemanScheduleEditInput,
} from '@/lib/drywall/foremanScheduleEdit'
import {
  fetchScheduleItemsForProject,
  type DrywallProjectScheduleItem,
  type DrywallScheduleItemStatus,
} from '@/services/scheduleService'
import { notifyAndReport } from '@/services/pushService'
import type { AssignedPersonOption } from '@/components/schedule/AssignedPersonsPicker'
import { belongsInDrywallWorkspaceFromListScalars } from '@/services/projectVisibility'
import { requireUserOrgId } from '@/services/userService'
import { isDrywallProjectClosed } from '@/types/drywall'

export type ForemanNewScheduleItem = {
  name: string
  type: 'field' | 'office'
  startDate: string
  endDate: string
  status: DrywallScheduleItemStatus
  assignedPersons: string[]
  notes?: string
}

/** Create a new schedule item as a field foreman (SECURITY DEFINER RPC). */
export async function createForemanScheduleItem(
  projectId: string,
  input: ForemanNewScheduleItem,
): Promise<string> {
  if (!isOnlineMode()) {
    throw new Error('Adding schedule items requires an online connection.')
  }

  const name = input.name.trim()
  if (!name) throw new Error('Name is required')
  if (!input.startDate) throw new Error('Start date is required')

  const assignedPersons = [...new Set(input.assignedPersons.filter(Boolean))]

  const { data, error } = await supabase.rpc('foreman_create_schedule_item', {
    p_project_id: projectId,
    p_item: {
      name,
      type: input.type,
      start_date: input.startDate.slice(0, 10),
      end_date: (input.endDate || input.startDate).slice(0, 10),
      status: input.status,
      assigned_persons: assignedPersons,
      notes: input.notes?.trim() || null,
    },
  })

  if (error) {
    console.error('foreman_create_schedule_item:', error)
    throw new Error(error.message || 'Could not add schedule item')
  }

  const newItemId = (data as string | null) ?? ''

  if (assignedPersons.length > 0) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      notifyAndReport({
        kind: 'schedule',
        projectId,
        authorUserId: user.id,
        assignedPersonIds: assignedPersons,
        itemName: name,
        newDate: input.startDate.slice(0, 10),
      })
    }
  }

  return newItemId
}

/** Delete a schedule item as a field foreman (SECURITY DEFINER RPC; strips ghost predecessor refs). */
export async function deleteForemanScheduleItem(itemId: string): Promise<void> {
  if (!isOnlineMode()) {
    throw new Error('Deleting schedule items requires an online connection.')
  }
  const { error } = await supabase.rpc('foreman_delete_schedule_item', { p_item_id: itemId })
  if (error) {
    console.error('foreman_delete_schedule_item:', error)
    throw new Error(error.message || 'Could not delete schedule item')
  }
}

export async function fetchForemanTeamRoster(): Promise<AssignedPersonOption[]> {
  if (!isOnlineMode()) return []
  const { data, error } = await supabase.rpc('list_org_team_roster_for_foreman')
  if (error) {
    console.error('list_org_team_roster_for_foreman:', error)
    throw new Error(error.message || 'Could not load team roster')
  }
  return ((data ?? []) as Array<{ id: string; name: string; kind: string }>)
    .filter((r) => r.id && r.name)
    .map((r) => ({
      id: r.id,
      name: r.name,
      kind: (r.kind === 'contractor' ? 'contractor' : 'employee') as 'employee' | 'contractor',
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function previewForemanScheduleEdit(
  projectId: string,
  itemId: string,
  edit: ForemanScheduleEditInput,
  resolveConflict?: 'detach' | 'shift',
): Promise<{
  siblings: DrywallProjectScheduleItem[]
  preview: ForemanCascadePreview
}> {
  const siblings = await fetchScheduleItemsForProject(projectId)
  if (!siblings.some((s) => s.id === itemId)) {
    throw new Error('Schedule item not found on this project')
  }
  const preview = buildCascadePreview(siblings, itemId, edit, {
    resolveConflict,
  })
  return { siblings, preview }
}

export async function applyForemanScheduleEdit(
  projectId: string,
  itemId: string,
  edit: ForemanScheduleEditInput,
  resolveConflict?: 'detach' | 'shift',
): Promise<ForemanCascadePreview> {
  if (!isOnlineMode()) {
    throw new Error('Schedule edits require an online connection.')
  }

  const { preview } = await previewForemanScheduleEdit(
    projectId,
    itemId,
    edit,
    resolveConflict,
  )

  if (preview.conflict) {
    throw new Error('Predecessor conflict — choose Detach or Shift predecessor')
  }

  const { error } = await supabase.rpc('foreman_apply_schedule_changes', {
    p_project_id: projectId,
    p_items: toRpcBatch(preview.items),
  })

  if (error) {
    console.error('foreman_apply_schedule_changes:', error)
    throw new Error(error.message || 'Could not save schedule changes')
  }

  const personIds = new Set<string>()
  for (const item of preview.items) {
    for (const id of item.assigned_persons ?? []) personIds.add(id)
  }
  const primary =
    preview.items.find((i) => i.id === itemId) ?? preview.items[0] ?? null
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user && personIds.size > 0) {
    notifyAndReport({
      kind: 'schedule',
      projectId,
      authorUserId: user.id,
      assignedPersonIds: [...personIds],
      itemName: primary?.name,
      newDate: primary?.start_date,
    })
  }

  return preview
}

// ============================================================================
// Job picker source
// ============================================================================
// Deliberately NOT fetchCrewProjectList: that list answers "what is on my
// plate" and hides work that has already finished, so a job whose schedule has
// gone stale — or one with no items at all — could never be picked, which is
// exactly when a foreman needs to add work to it. This answers "where can I add
// work" instead: every open drywall job. Foremen hold an org-wide projects
// SELECT via user_is_field_foreman() (20260911120000).

export type ForemanPickerProject = { id: string; name: string }

/** Scalar-only projection — never select full metadata (multi-MB per row). */
const PICKER_PROJECT_SELECT =
  'id, name, status, type, app_scope:metadata->>app_scope, quote_outcome:metadata->legacy->quote->>outcome, quote_sqft:metadata->legacy->quote->>sqft, quote_final_total:metadata->legacy->quote->calculations->>finalTotal, quote_total_amount:metadata->legacy->quote->>totalQuoteAmount, quote_version:metadata->legacy->quote->>version, quote_first_line_item:metadata->legacy->quote->lineItems->0'

type PickerProjectRow = {
  id: string
  name: string | null
  status: string | null
  type: string | null
  app_scope: unknown
  quote_outcome: unknown
  quote_sqft: unknown
  quote_final_total: unknown
  quote_total_amount: unknown
  quote_version: unknown
  quote_first_line_item?: unknown
}

function isDrywallJob(row: PickerProjectRow): boolean {
  if (row.type === 'drywall') return true
  if (row.app_scope === 'DRYWALL_ONLY') return true
  return belongsInDrywallWorkspaceFromListScalars({
    app_scope: row.app_scope,
    quote_sqft: row.quote_sqft,
    quote_final_total: row.quote_final_total,
    quote_total_amount: row.quote_total_amount,
    quote_version: row.quote_version,
    quote_has_line_items: row.quote_first_line_item != null,
  })
}

/**
 * Pickable = a drywall job that is open, and is actually being worked.
 *
 * The last clause matters: a job still sitting at 'quote' status can already
 * have scheduled work on it (Willoughby Hills, Neptune Oval, Moreland Hills as
 * of 2026-09-15), so stage alone would hide exactly the jobs someone is mid-way
 * through. Anything with an item on it stays pickable no matter its stage or how
 * old that item is.
 */
function isPickableJob(row: PickerProjectRow, hasScheduledWork: boolean): boolean {
  if (!isDrywallJob(row)) return false
  if (isDrywallProjectClosed(row.status)) return false
  if (row.quote_outcome === 'lost') return false
  if ((row.status ?? '').trim() !== 'quote') return true
  return row.quote_outcome === 'approved' || hasScheduledWork
}

export async function fetchForemanPickerProjects(): Promise<ForemanPickerProject[]> {
  if (!isOnlineMode()) return []
  const organizationId = await requireUserOrgId()

  const [projects, scheduled] = await Promise.all([
    supabase.from('projects').select(PICKER_PROJECT_SELECT).eq('organization_id', organizationId),
    supabase.from('schedule_items').select('project_id').eq('organization_id', organizationId),
  ])

  if (projects.error) throw new Error(projects.error.message || 'Failed to load jobs')
  if (scheduled.error) throw new Error(scheduled.error.message || 'Failed to load jobs')

  const hasWork = new Set(
    ((scheduled.data ?? []) as Array<{ project_id: string }>).map((row) => row.project_id),
  )

  return ((projects.data ?? []) as PickerProjectRow[])
    .filter((row) => isPickableJob(row, hasWork.has(row.id)))
    .map((row) => ({ id: row.id, name: row.name?.trim() || 'Untitled' }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

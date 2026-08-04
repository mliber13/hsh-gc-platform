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
  fetchScheduleItemsForDrywallProject,
  type DrywallProjectScheduleItem,
  type DrywallScheduleItemStatus,
} from '@/services/scheduleService'
import { requestPushNotify } from '@/services/pushService'
import type { AssignedPersonOption } from '@/components/schedule/AssignedPersonsPicker'

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
      void requestPushNotify({
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
  const siblings = await fetchScheduleItemsForDrywallProject(projectId)
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
    void requestPushNotify({
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

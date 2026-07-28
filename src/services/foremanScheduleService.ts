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
} from '@/services/scheduleService'
import type { AssignedPersonOption } from '@/components/schedule/AssignedPersonsPicker'

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

  return preview
}

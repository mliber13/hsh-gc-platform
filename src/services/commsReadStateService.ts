// ============================================================================
// Comms read state — per-user unread tracking (D.6.3)
// ============================================================================

import { supabase, isOnlineMode } from '@/lib/supabase'
import { fetchCrewProjectList } from '@/services/crewWorkspaceService'
import { fetchDrywallProjects } from '@/services/drywallProjectsService'
import { getCurrentUserProfile, requireUserOrgId } from '@/services/userService'
import { isCrewRole, deriveEffectiveRole } from '@/lib/rbac'
import type { CommsUnreadEntry, CommsUnreadSummary } from '@/types/crew'

export type ProjectCrewReadState = {
  userId: string
  userName: string
  lastReadAt: string
}

const OFFICE_READER_ROLES = new Set(['owner', 'office_gc', 'office_drywall'])

/** Crew-only account — same rule as drywallPhotosService persistFieldTakeoffPhotos. */
function isCrewOnlyProfile(roles: string[] | undefined | null): boolean {
  const r = roles ?? []
  return r.includes('crew') && !r.some((role) => OFFICE_READER_ROLES.has(role))
}

function readerDisplayName(fullName: unknown, email: unknown): string {
  if (typeof fullName === 'string' && fullName.trim()) return fullName.trim()
  if (typeof email === 'string' && email.trim()) return email.trim()
  return 'Crew'
}

/** id + name only for the scope's drywall projects — no metadata (unread is computed by RPC). */
async function loadProjectsForScope(
  scope: 'operator' | 'crew',
): Promise<Array<{ id: string; name: string }>> {
  if (scope === 'crew') {
    const assigned = await fetchCrewProjectList()
    const byId = new Map<string, string>()
    for (const p of assigned) {
      if (!byId.has(p.projectId)) byId.set(p.projectId, p.projectName)
    }
    return [...byId.entries()].map(([id, name]) => ({ id, name }))
  }
  const list = await fetchDrywallProjects()
  return list.map((p) => ({ id: p.id, name: p.name }))
}

export async function markProjectCommsRead(projectId: string): Promise<void> {
  if (!isOnlineMode()) return

  const orgId = await requireUserOrgId()
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return

  const { error } = await supabase.from('comms_read_state').upsert(
    {
      user_id: userId,
      project_id: projectId,
      organization_id: orgId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,project_id' },
  )

  if (error) throw new Error(error.message || 'Failed to mark comms as read')
}

/** Crew read receipts for operator comms panel — excludes current user and office roles. */
export async function fetchProjectCrewReadState(
  projectId: string,
): Promise<ProjectCrewReadState[]> {
  if (!isOnlineMode()) return []

  const orgId = await requireUserOrgId()
  const { data: userData } = await supabase.auth.getUser()
  const currentUserId = userData.user?.id
  if (!currentUserId) return []

  const { data: readRows, error } = await supabase
    .from('comms_read_state')
    .select('user_id, last_read_at')
    .eq('organization_id', orgId)
    .eq('project_id', projectId)

  if (error) throw new Error(error.message || 'Failed to load comms read state')

  const rows = (readRows ?? []).filter(
    (row): row is { user_id: string; last_read_at: string } =>
      typeof row.user_id === 'string' &&
      row.user_id !== currentUserId &&
      typeof row.last_read_at === 'string',
  )

  if (rows.length === 0) return []

  const userIds = [...new Set(rows.map((row) => row.user_id))]

  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email, roles')
    .eq('organization_id', orgId)
    .in('id', userIds)

  if (profileError) throw new Error(profileError.message || 'Failed to load reader profiles')

  const profileById = new Map(
    (profileRows ?? []).map((profile) => [profile.id as string, profile]),
  )

  const result: ProjectCrewReadState[] = []

  for (const row of rows) {
    const profile = profileById.get(row.user_id)
    if (!profile) continue
    const roles = Array.isArray(profile.roles)
      ? profile.roles.filter((v): v is string => typeof v === 'string')
      : []
    if (!isCrewOnlyProfile(roles)) continue

    result.push({
      userId: row.user_id,
      userName: readerDisplayName(profile.full_name, profile.email),
      lastReadAt: row.last_read_at,
    })
  }

  result.sort(
    (a, b) => new Date(b.lastReadAt).getTime() - new Date(a.lastReadAt).getTime(),
  )

  return result
}

export async function fetchCommsUnreadSummary(options?: {
  scope?: 'operator' | 'crew'
}): Promise<CommsUnreadSummary> {
  if (!isOnlineMode()) {
    return { byProject: [], totalUnread: 0 }
  }

  const profile = await getCurrentUserProfile()
  const effectiveRole = deriveEffectiveRole(profile)
  const scope =
    options?.scope ?? (isCrewRole(effectiveRole) ? 'crew' : 'operator')

  const projects = await loadProjectsForScope(scope)
  if (projects.length === 0) {
    return { byProject: [], totalUnread: 0 }
  }

  const nameById = new Map(projects.map((p) => [p.id, p.name]))
  const { data: rows, error } = await supabase.rpc('comms_unread_for_projects', {
    p_project_ids: projects.map((p) => p.id),
  })
  if (error) {
    console.warn('comms_unread_for_projects:', error)
    return { byProject: [], totalUnread: 0 }
  }

  const entries: CommsUnreadEntry[] = []
  let totalUnread = 0
  for (const row of (rows ?? []) as Array<{
    project_id: string
    unread_count: number
    last_entry_at: string | null
  }>) {
    const unreadCount = Number(row.unread_count) || 0
    if (unreadCount <= 0) continue
    entries.push({
      projectId: row.project_id,
      projectName: nameById.get(row.project_id)?.trim() || 'Untitled',
      unreadCount,
      lastEntryAt: row.last_entry_at,
    })
    totalUnread += unreadCount
  }

  entries.sort((a, b) => {
    const aTime = a.lastEntryAt ? new Date(a.lastEntryAt).getTime() : 0
    const bTime = b.lastEntryAt ? new Date(b.lastEntryAt).getTime() : 0
    return bTime - aTime
  })

  return { byProject: entries, totalUnread }
}

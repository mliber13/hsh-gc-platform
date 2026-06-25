// ============================================================================
// Comms read state — per-user unread tracking (D.6.3)
// ============================================================================

import { supabase, isOnlineMode } from '@/lib/supabase'
import { normalizeCommsLogEntry } from '@/lib/drywall/commsLogUtils'
import { belongsInDrywallWorkspace } from '@/services/projectVisibility'
import { fetchCrewProjectList } from '@/services/crewWorkspaceService'
import { fetchDrywallProjects } from '@/services/drywallProjectsService'
import { getCurrentUserProfile, requireUserOrgId } from '@/services/userService'
import { isCrewRole, deriveEffectiveRole } from '@/lib/rbac'
import type { CommsUnreadEntry, CommsUnreadSummary } from '@/types/crew'

const EPOCH = new Date(0).toISOString()

type ProjectCommsRow = {
  id: string
  name: string
  metadata: Record<string, unknown> | null
  type?: string
}

function parseCommsFromMetadata(metadata: Record<string, unknown> | null): Array<{
  at: string
}> {
  const legacy = metadata?.legacy
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return []
  const raw = (legacy as Record<string, unknown>).commsLog
  if (!Array.isArray(raw)) return []
  return raw
    .map((e) => normalizeCommsLogEntry(e))
    .filter((e): e is NonNullable<typeof e> => e !== null)
}

function isDrywallProjectRow(row: ProjectCommsRow): boolean {
  if (row.type === 'drywall') return true
  const meta = row.metadata ?? {}
  if (meta.app_scope === 'DRYWALL_ONLY') return true
  return belongsInDrywallWorkspace(meta)
}

async function loadProjectsForScope(
  scope: 'operator' | 'crew',
): Promise<ProjectCommsRow[]> {
  const orgId = await requireUserOrgId()

  if (scope === 'crew') {
    const assigned = await fetchCrewProjectList()
    if (assigned.length === 0) return []
    const ids = assigned.map((p) => p.projectId)
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, metadata, type')
      .eq('organization_id', orgId)
      .in('id', ids)
    if (error) throw new Error(error.message || 'Failed to load projects')
    return (data ?? []) as ProjectCommsRow[]
  }

  const list = await fetchDrywallProjects()
  if (list.length === 0) return []
  const ids = list.map((p) => p.id)
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, metadata, type')
    .eq('organization_id', orgId)
    .in('id', ids)
  if (error) throw new Error(error.message || 'Failed to load projects')
  return (data ?? []) as ProjectCommsRow[]
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

  const projects = (await loadProjectsForScope(scope)).filter(isDrywallProjectRow)
  if (projects.length === 0) {
    return { byProject: [], totalUnread: 0 }
  }

  const orgId = await requireUserOrgId()
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return { byProject: [], totalUnread: 0 }

  const projectIds = projects.map((p) => p.id)
  const { data: readRows, error: readError } = await supabase
    .from('comms_read_state')
    .select('project_id, last_read_at')
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .in('project_id', projectIds)

  if (readError) throw new Error(readError.message || 'Failed to load read state')

  const lastReadByProject = new Map<string, string>()
  for (const row of readRows ?? []) {
    if (typeof row.project_id === 'string' && typeof row.last_read_at === 'string') {
      lastReadByProject.set(row.project_id, row.last_read_at)
    }
  }

  const entries: CommsUnreadEntry[] = []
  let totalUnread = 0

  for (const project of projects) {
    const comms = parseCommsFromMetadata(project.metadata)
    const lastRead = lastReadByProject.get(project.id) ?? EPOCH
    const lastReadMs = new Date(lastRead).getTime()
    const unreadCount = comms.filter((e) => new Date(e.at).getTime() > lastReadMs).length
    if (unreadCount <= 0) continue

    const lastEntryAt =
      comms.length > 0
        ? comms.reduce((max, e) => (e.at > max ? e.at : max), comms[0].at)
        : null

    entries.push({
      projectId: project.id,
      projectName: project.name?.trim() || 'Untitled',
      unreadCount,
      lastEntryAt,
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

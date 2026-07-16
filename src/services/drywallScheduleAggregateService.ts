// ============================================================================
// Cross-project drywall schedule aggregate (D.6.7)
// ============================================================================

import { supabase, isOnlineMode } from '@/lib/supabase'
import { belongsInDrywallWorkspaceFromListScalars } from '@/services/projectVisibility'
import { requireUserOrgId } from '@/services/userService'
import { normalizeDrywallProjectStatus } from '@/types/drywall'

export interface CrossProjectScheduleItem {
  id: string
  projectId: string
  projectName: string
  projectStatus: string
  name: string
  type: 'field' | 'office'
  startDate: string
  endDate: string
  status: 'not-started' | 'in-progress' | 'complete' | 'delayed'
  assignedPersons: string[]
}

type ProjectRow = {
  id: string
  name: string
  status: string
  type: string | null
  app_scope: unknown
  quote_sqft: unknown
  quote_final_total: unknown
  quote_total_amount: unknown
  quote_version: unknown
}

type ScheduleItemRow = {
  id: string
  project_id: string
  name: string
  type: 'field' | 'office' | null
  start_date: string
  end_date: string
  status: CrossProjectScheduleItem['status'] | null
  assigned_persons: string[] | null
}

function isDrywallProjectRow(row: ProjectRow): boolean {
  if (row.type === 'drywall') return true
  return belongsInDrywallWorkspaceFromListScalars({
    app_scope: row.app_scope,
    quote_sqft: row.quote_sqft,
    quote_final_total: row.quote_final_total,
    quote_total_amount: row.quote_total_amount,
    quote_version: row.quote_version,
  })
}

/** Scalar-only project projection — never select full metadata (can be multi-MB per row). */
const SCHEDULE_PROJECT_SELECT =
  'id, name, status, type, app_scope:metadata->>app_scope, quote_sqft:metadata->legacy->quote->>sqft, quote_final_total:metadata->legacy->quote->calculations->>finalTotal, quote_total_amount:metadata->legacy->quote->>totalQuoteAmount, quote_version:metadata->legacy->quote->>version'

export async function fetchCrossProjectScheduleItems(): Promise<CrossProjectScheduleItem[]> {
  if (!isOnlineMode()) return []

  const organizationId = await requireUserOrgId()

  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select(SCHEDULE_PROJECT_SELECT)
    .eq('organization_id', organizationId)

  if (projectsError) {
    throw new Error(projectsError.message || 'Failed to load drywall projects')
  }

  const drywallProjects = ((projects ?? []) as ProjectRow[]).filter(isDrywallProjectRow)
  if (drywallProjects.length === 0) return []

  const projectById = new Map(
    drywallProjects.map((p) => [
      p.id,
      {
        name: p.name?.trim() || 'Untitled',
        status: normalizeDrywallProjectStatus(p.status),
      },
    ]),
  )
  const projectIds = drywallProjects.map((p) => p.id)

  const { data: items, error: itemsError } = await supabase
    .from('schedule_items')
    .select('id, project_id, name, type, start_date, end_date, status, assigned_persons')
    .eq('organization_id', organizationId)
    .in('project_id', projectIds)
    .order('start_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (itemsError) {
    throw new Error(itemsError.message || 'Failed to load schedule items')
  }

  const results: CrossProjectScheduleItem[] = []
  for (const row of (items ?? []) as ScheduleItemRow[]) {
    const project = projectById.get(row.project_id)
    if (!project) continue
    results.push({
      id: row.id,
      projectId: row.project_id,
      projectName: project.name,
      projectStatus: project.status,
      name: row.name?.trim() || 'Schedule item',
      type: row.type === 'office' ? 'office' : 'field',
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status ?? 'not-started',
      assignedPersons: row.assigned_persons ?? [],
    })
  }
  return results
}

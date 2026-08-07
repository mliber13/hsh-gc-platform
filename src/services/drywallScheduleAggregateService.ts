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
  /** Formatted job address for search/display. */
  projectAddress: string
  name: string
  type: 'field' | 'office'
  startDate: string
  endDate: string
  status: 'not-started' | 'in-progress' | 'complete' | 'delayed'
  assignedPersons: string[]
  /** Assigned supplier (material orders) — counts as assigned for the unassigned filter. */
  supplierId: string | null
  /** Assigned subcontractor company — also counts as assigned. */
  assignedCompanyId: string | null
}

type ProjectRow = {
  id: string
  name: string
  status: string
  type: string | null
  address: unknown
  city: string | null
  state: string | null
  zip_code: string | null
  app_scope: unknown
  quote_sqft: unknown
  quote_final_total: unknown
  quote_total_amount: unknown
  quote_version: unknown
  /** First v3 line item only — presence probe; never the full array. */
  quote_first_line_item?: unknown
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
  supplier_id: string | null
  assigned_company_id: string | null
}

function isDrywallProjectRow(row: ProjectRow): boolean {
  if (row.type === 'drywall') return true
  return belongsInDrywallWorkspaceFromListScalars({
    app_scope: row.app_scope,
    quote_sqft: row.quote_sqft,
    quote_final_total: row.quote_final_total,
    quote_total_amount: row.quote_total_amount,
    quote_version: row.quote_version,
    quote_has_line_items: row.quote_first_line_item != null,
  })
}

/** Scalar-only project projection — never select full metadata (can be multi-MB per row). */
const SCHEDULE_PROJECT_SELECT =
  'id, name, status, type, address, city, state, zip_code, app_scope:metadata->>app_scope, quote_sqft:metadata->legacy->quote->>sqft, quote_final_total:metadata->legacy->quote->calculations->>finalTotal, quote_total_amount:metadata->legacy->quote->>totalQuoteAmount, quote_version:metadata->legacy->quote->>version, quote_first_line_item:metadata->legacy->quote->lineItems->0'

/** Best-effort address string from the project row (mirrors crewWorkspaceService.formatAddress). */
function formatProjectAddress(row: ProjectRow): string {
  if (typeof row.address === 'string' && row.address.trim()) return row.address.trim()
  if (row.address && typeof row.address === 'object') {
    const a = row.address as Record<string, unknown>
    const parts = [
      typeof a.street === 'string' ? a.street : typeof a.line1 === 'string' ? a.line1 : '',
      typeof a.city === 'string' ? a.city : row.city ?? '',
      typeof a.state === 'string' ? a.state : row.state ?? '',
      typeof a.zip === 'string' ? a.zip : typeof a.zipCode === 'string' ? a.zipCode : row.zip_code ?? '',
    ].filter(Boolean)
    if (parts.length) return parts.join(', ')
  }
  return [row.city, row.state, row.zip_code].filter(Boolean).join(', ')
}

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
        address: formatProjectAddress(p),
      },
    ]),
  )
  const projectIds = drywallProjects.map((p) => p.id)

  const { data: items, error: itemsError } = await supabase
    .from('schedule_items')
    .select(
      'id, project_id, name, type, start_date, end_date, status, assigned_persons, supplier_id, assigned_company_id',
    )
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
      projectAddress: project.address,
      name: row.name?.trim() || 'Schedule item',
      type: row.type === 'office' ? 'office' : 'field',
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status ?? 'not-started',
      assignedPersons: row.assigned_persons ?? [],
      supplierId: row.supplier_id ?? null,
      assignedCompanyId: row.assigned_company_id ?? null,
    })
  }
  return results
}

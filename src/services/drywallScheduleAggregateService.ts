// ============================================================================
// Cross-project schedule aggregate
// ============================================================================
// Project list is derived from schedule_items.division, never from project
// classification (unification plan decision 4 / invariant 4).

import { supabase, isOnlineMode } from '@/lib/supabase'
import { requireUserOrgId } from '@/services/userService'
import type { PortfolioTypeFilter } from '@/services/scheduleService'
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
  assignedCompanyName: string | null
  division: 'gc' | 'drywall'
}

type ProjectRow = {
  id: string
  name: string
  status: string
  address: unknown
  city: string | null
  state: string | null
  zip_code: string | null
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
  division: 'gc' | 'drywall' | null
  subcontractors?: { name: string | null } | Array<{ name: string | null }> | null
}

/** Scalar-only project projection — never select full metadata (can be multi-MB per row). */
const SCHEDULE_PROJECT_SELECT = 'id, name, status, address, city, state, zip_code'

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

function assignedCompanyName(
  subcontractors: ScheduleItemRow['subcontractors'],
): string | null {
  if (Array.isArray(subcontractors)) return subcontractors[0]?.name ?? null
  return subcontractors?.name ?? null
}

/**
 * Cross-project schedule items for a portfolio lens.
 * `'all'` adds no division clause (invariant 4 — the orphan-work guard).
 * Default `'drywall'` keeps the dashboard and crew calendar on drywall items.
 */
export async function fetchCrossProjectScheduleItems(
  lens: PortfolioTypeFilter = 'drywall',
): Promise<CrossProjectScheduleItem[]> {
  if (!isOnlineMode()) return []

  const organizationId = await requireUserOrgId()

  let itemsQuery = supabase
    .from('schedule_items')
    .select(
      'id, project_id, name, type, start_date, end_date, status, assigned_persons, supplier_id, assigned_company_id, division, subcontractors:assigned_company_id(name)',
    )
    .eq('organization_id', organizationId)

  if (lens === 'gc' || lens === 'drywall') {
    itemsQuery = itemsQuery.eq('division', lens)
  }

  const { data: items, error: itemsError } = await itemsQuery
    .order('start_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (itemsError) {
    throw new Error(itemsError.message || 'Failed to load schedule items')
  }

  const rows = (items ?? []) as ScheduleItemRow[]
  const projectIds = [...new Set(rows.map((row) => row.project_id))]
  if (projectIds.length === 0) return []

  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select(SCHEDULE_PROJECT_SELECT)
    .eq('organization_id', organizationId)
    .in('id', projectIds)

  if (projectsError) {
    throw new Error(projectsError.message || 'Failed to load projects')
  }

  const projectById = new Map(
    ((projects ?? []) as ProjectRow[]).map((p) => [
      p.id,
      {
        name: p.name?.trim() || 'Untitled',
        status: normalizeDrywallProjectStatus(p.status),
        address: formatProjectAddress(p),
      },
    ]),
  )

  const results: CrossProjectScheduleItem[] = []
  for (const row of rows) {
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
      assignedCompanyName: assignedCompanyName(row.subcontractors),
      division: row.division === 'gc' ? 'gc' : 'drywall',
    })
  }
  return results
}

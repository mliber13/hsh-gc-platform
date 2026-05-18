import { supabase } from '@/lib/supabase'
import type { ConfirmationStatus } from '@/types'
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

  return ((data ?? []) as ProjectRow[]).map((row) => ({
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
      'id, project_id, schedule_id, name, start_date, end_date, confirmation_status, confirmation_notes, status, assigned_company_id, notes, subcontractors:assigned_company_id(name)',
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

// ============================================================================
// Supabase Service Layer
// ============================================================================
//
// This service provides database operations using Supabase
// It replaces localStorage when online mode is enabled
//

import { supabase, isOnlineMode } from '@/lib/supabase'
import {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  Trade,
  TradeInput,
  SubItem,
  LaborEntry,
  MaterialEntry,
  SubcontractorEntry,
  PlanEstimateTemplate,
  CreatePlanEstimateTemplateInput,
  UpdatePlanEstimateTemplateInput,
  ProjectDocument,
  DocumentType,
} from '@/types'
import {
  DealDocument,
  DealDocumentType,
} from '@/types/deal'
import type { WorkPackage, CreateWorkPackageInput, UpdateWorkPackageInput } from '@/types/workPackage'
import type {
  ProjectMilestone,
  MilestoneSourceApp,
  CreateMilestoneInput,
  UpdateMilestoneInput,
} from '@/types/projectMilestone'
import type {
  GameplanPlay,
  CreateGameplanPlayInput,
  UpdateGameplanPlayInput,
  PlaybookPlay,
  CreatePlaybookPlayInput,
  UpdatePlaybookPlayInput,
  DefaultPlaybookPlay,
  CreateDefaultPlaybookPlayInput,
  UpdateDefaultPlaybookPlayInput,
} from '@/types/gameplan'

// ============================================================================
// PROJECT OPERATIONS
// ============================================================================

// Helper to transform database row to Project
async function transformProject(row: any): Promise<Project> {
  // Fetch the estimate for this project
  let estimate = await fetchEstimateByProjectId(row.id)
  
  if (!estimate) {
    console.warn(`No estimate found for project ${row.id}, creating one`)
    // Try to create an estimate if it doesn't exist
    estimate = await createEstimateInDB(row.id)
    if (estimate) {
      console.log(`Created estimate ${estimate.id} for project ${row.id}`)
    }
  }
  
  // Ensure we have a valid estimate with ID
  const finalEstimate = estimate || { 
    id: '', 
    projectId: row.id, 
    version: 1,
    trades: [],
    subtotal: 0,
    overhead: 0,
    profit: 0,
    contingency: 0,
    totalEstimate: 0,
  }

  console.log(`Project ${row.name} estimate ID: ${finalEstimate.id}`)
  
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    address: row.address,
    city: row.city,
    state: row.state,
    zipCode: row.zip_code,
    client: row.client,
    startDate: row.start_date ? new Date(row.start_date) : undefined,
    endDate: row.end_date ? new Date(row.end_date) : undefined,
    metadata: row.metadata || {},
    specs: row.specs || undefined,
    qbProjectId: row.qb_project_id ?? undefined,
    qbProjectName: row.qb_project_name ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    estimate: finalEstimate,
  }
}

export async function fetchProjects(): Promise<Project[]> {
  if (!isOnlineMode()) return []

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching projects:', error)
    return []
  }

  return await Promise.all(data.map(transformProject))
}

export async function fetchProjectById(projectId: string): Promise<Project | null> {
  if (!isOnlineMode()) return null

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()

  if (error) {
    console.error('Error fetching project:', error)
    return null
  }

  return await transformProject(data)
}

export async function createProjectInDB(input: CreateProjectInput): Promise<Project | null> {
  if (!isOnlineMode()) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Get user's organization
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    console.error('User profile not found')
    return null
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      name: input.name,
      type: input.type,
      status: 'estimating',
      client: input.client,
      address: input.address,
      city: input.city,
      state: input.state,
      zip_code: input.zipCode,
      start_date: input.startDate,
      end_date: input.endDate,
      metadata: input.metadata || {},
      specs: input.specs || null,
      user_id: user.id,
      organization_id: profile.organization_id,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating project:', error)
    return null
  }

  return await transformProject(data)
}

export async function updateProjectInDB(projectId: string, updates: UpdateProjectInput): Promise<Project | null> {
  if (!isOnlineMode()) return null

  // First check if project exists
  const { data: existingProject } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .single()

  if (!existingProject) {
    console.warn(`Project ${projectId} not found in database. Skipping update.`)
    return null
  }

  const updateData: any = {
    name: updates.name,
    status: updates.status,
    address: updates.address,
    city: updates.city,
    state: updates.state,
    zip_code: updates.zipCode,
    client: updates.client,
    start_date: updates.startDate?.toISOString(),
    end_date: updates.endDate?.toISOString(),
    metadata: updates.metadata,
  }
  
  // Only include specs if it's provided in the update
  if (updates.specs !== undefined) {
    updateData.specs = updates.specs || null
  }

  const { data, error } = await supabase
    .from('projects')
    .update(updateData)
    .eq('id', projectId)
    .select()
    .single()

  if (error) {
    console.error('Error updating project:', error)
    return null
  }

  if (!data) {
    console.warn(`Update succeeded but no data returned for project ${projectId}`)
    return null
  }

  return transformProject(data)
}

export async function deleteProjectFromDB(projectId: string): Promise<boolean> {
  if (!isOnlineMode()) return false

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)

  if (error) {
    console.error('Error deleting project:', error)
    return false
  }

  return true
}

// ---------------------------------------------------------------------------
// Activate project (idempotent: event + status 'in-progress')
// ---------------------------------------------------------------------------

export interface ActivateProjectOptions {
  reason?: string
  notes?: string
}

export async function activateProjectInDB(
  projectId: string,
  options: ActivateProjectOptions = {}
): Promise<Project | null> {
  if (!isOnlineMode()) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const profileOrgId = profile?.organization_id ?? null

  const { data: projectRow, error: fetchError } = await supabase
    .from('projects')
    .select('id, status, organization_id')
    .eq('id', projectId)
    .single()

  if (fetchError || !projectRow) {
    console.warn('Project not found for activation:', projectId, fetchError)
    return null
  }

  if (projectRow.status === 'in-progress') {
    return await fetchProjectById(projectId)
  }

  const orgId = projectRow.organization_id || profileOrgId || 'default-org'

  const { error: eventError } = await supabase
    .from('project_events')
    .insert({
      project_id: projectId,
      organization_id: orgId,
      event_type: 'ACTIVATED',
      source_app: 'GC',
      payload: (options.reason || options.notes) ? { reason: options.reason ?? null, notes: options.notes ?? null } : null,
      created_by: user.id,
    })

  if (eventError) {
    console.error('Error inserting project_events on activate:', eventError)
    return null
  }

  const { data: updatedRow, error: updateError } = await supabase
    .from('projects')
    .update({ status: 'in-progress' })
    .eq('id', projectId)
    .select()
    .single()

  if (updateError || !updatedRow) {
    console.error('Error updating project status on activate:', updateError)
    return null
  }

  return await transformProject(updatedRow)
}

// ============================================================================
// WORK PACKAGES (public.work_packages)
// ============================================================================

function transformWorkPackage(row: any): WorkPackage {
  return {
    id: row.id,
    projectId: row.project_id,
    organizationId: row.organization_id,
    tradeId: row.trade_id ?? null,
    subItemId: row.sub_item_id ?? null,
    packageType: row.package_type,
    status: row.status,
    ownerTeam: row.owner_team,
    responsiblePartyType: row.responsible_party_type,
    responsiblePartyId: row.responsible_party_id ?? null,
    targetStart: row.target_start ?? null,
    targetFinish: row.target_finish ?? null,
    forecastStart: row.forecast_start ?? null,
    forecastFinish: row.forecast_finish ?? null,
    actualStart: row.actual_start ?? null,
    actualFinish: row.actual_finish ?? null,
    notes: row.notes ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export async function fetchWorkPackages(projectId: string): Promise<WorkPackage[]> {
  if (!isOnlineMode()) return []

  const { data, error } = await supabase
    .from('work_packages')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching work packages:', error)
    return []
  }

  return (data || []).map(transformWorkPackage)
}

export async function createWorkPackage(
  projectId: string,
  input: CreateWorkPackageInput
): Promise<WorkPackage | null> {
  if (!isOnlineMode()) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const profileOrgId = profile?.organization_id ?? null

  const { data: projectRow } = await supabase
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .single()

  const orgId = projectRow?.organization_id || profileOrgId || 'default-org'

  const { data, error } = await supabase
    .from('work_packages')
    .insert({
      project_id: projectId,
      organization_id: orgId,
      trade_id: input.tradeId ?? null,
      sub_item_id: input.subItemId ?? null,
      package_type: input.packageType,
      status: 'PLANNED',
      owner_team: 'GC',
      responsible_party_type: input.responsiblePartyType ?? 'IN_HOUSE',
      target_start: input.targetStart ?? null,
      target_finish: input.targetFinish ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating work package:', error)
    return null
  }

  return transformWorkPackage(data)
}

export async function updateWorkPackage(
  id: string,
  updates: UpdateWorkPackageInput
): Promise<WorkPackage | null> {
  if (!isOnlineMode()) return null

  const updateData: Record<string, unknown> = {}
  if (updates.packageType !== undefined) updateData.package_type = updates.packageType
  if (updates.status !== undefined) updateData.status = updates.status
  if (updates.responsiblePartyType !== undefined) updateData.responsible_party_type = updates.responsiblePartyType
  if (updates.tradeId !== undefined) updateData.trade_id = updates.tradeId
  if (updates.subItemId !== undefined) updateData.sub_item_id = updates.subItemId
  if (updates.targetStart !== undefined) updateData.target_start = updates.targetStart
  if (updates.targetFinish !== undefined) updateData.target_finish = updates.targetFinish
  if (updates.notes !== undefined) updateData.notes = updates.notes

  if (Object.keys(updateData).length === 0) {
    const { data: existing } = await supabase.from('work_packages').select('*').eq('id', id).single()
    return existing ? transformWorkPackage(existing) : null
  }

  const { data, error } = await supabase
    .from('work_packages')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating work package:', error)
    return null
  }

  return transformWorkPackage(data)
}

export async function deleteWorkPackage(id: string): Promise<boolean> {
  if (!isOnlineMode()) return false

  const { error } = await supabase.from('work_packages').delete().eq('id', id)

  if (error) {
    console.error('Error deleting work package:', error)
    return false
  }

  return true
}

// ============================================================================
// PROJECT MILESTONES (public.project_milestones)
// ============================================================================

function transformMilestone(row: any): ProjectMilestone {
  return {
    id: row.id,
    projectId: row.project_id,
    organizationId: row.organization_id,
    createdBy: row.created_by ?? null,
    sourceApp: row.source_app,
    milestoneKey: row.milestone_key,
    milestoneName: row.milestone_name,
    targetDate: row.target_date ?? null,
    forecastDate: row.forecast_date ?? null,
    actualDate: row.actual_date ?? null,
    status: row.status,
    notes: row.notes ?? null,
    metadata: row.metadata ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export async function fetchMilestones(projectId: string): Promise<ProjectMilestone[]> {
  if (!isOnlineMode()) return []

  const { data, error } = await supabase
    .from('project_milestones')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching milestones:', error)
    return []
  }

  return (data || []).map(transformMilestone)
}

export async function upsertMilestone(
  projectId: string,
  sourceApp: MilestoneSourceApp,
  input: CreateMilestoneInput
): Promise<ProjectMilestone | null> {
  if (!isOnlineMode()) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const profileOrgId = profile?.organization_id ?? null

  const { data: projectRow } = await supabase
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .single()

  const orgId = projectRow?.organization_id || profileOrgId || 'default-org'

  const row = {
    project_id: projectId,
    organization_id: orgId,
    created_by: user.id,
    source_app: sourceApp,
    milestone_key: input.milestoneKey.trim(),
    milestone_name: input.milestoneName.trim(),
    target_date: input.targetDate?.trim() || null,
    forecast_date: input.forecastDate?.trim() || null,
    actual_date: input.actualDate?.trim() || null,
    status: input.status ?? 'PLANNED',
    notes: input.notes?.trim() || null,
  }

  const { data, error } = await supabase
    .from('project_milestones')
    .upsert(row, {
      onConflict: 'project_id,source_app,milestone_key',
    })
    .select()
    .single()

  if (error) {
    console.error('Error upserting milestone:', error)
    return null
  }

  return transformMilestone(data)
}

export async function updateMilestone(
  id: string,
  updates: UpdateMilestoneInput
): Promise<ProjectMilestone | null> {
  if (!isOnlineMode()) return null

  const updateData: Record<string, unknown> = {}
  if (updates.milestoneName !== undefined) updateData.milestone_name = updates.milestoneName
  if (updates.targetDate !== undefined) updateData.target_date = updates.targetDate
  if (updates.forecastDate !== undefined) updateData.forecast_date = updates.forecastDate
  if (updates.actualDate !== undefined) updateData.actual_date = updates.actualDate
  if (updates.status !== undefined) updateData.status = updates.status
  if (updates.notes !== undefined) updateData.notes = updates.notes

  if (Object.keys(updateData).length === 0) {
    const { data: existing } = await supabase
      .from('project_milestones')
      .select('*')
      .eq('id', id)
      .single()
    return existing ? transformMilestone(existing) : null
  }

  const { data, error } = await supabase
    .from('project_milestones')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating milestone:', error)
    return null
  }

  return transformMilestone(data)
}

export async function deleteMilestone(id: string): Promise<boolean> {
  if (!isOnlineMode()) return false

  const { error } = await supabase.from('project_milestones').delete().eq('id', id)

  if (error) {
    console.error('Error deleting milestone:', error)
    return false
  }

  return true
}

// ============================================================================
// GAMEPLAN PLAYS (public.gameplan_plays)
// ============================================================================

function transformGameplanPlay(row: any): GameplanPlay {
  return {
    id: row.id,
    projectId: row.project_id,
    organizationId: row.organization_id,
    chapterKey: row.chapter_key,
    title: row.title,
    description: row.description ?? null,
    owner: row.owner,
    status: row.status,
    targetStart: row.target_start ?? null,
    targetFinish: row.target_finish ?? null,
    sortOrder: row.sort_order ?? 0,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export async function fetchGameplanPlays(projectId: string): Promise<GameplanPlay[]> {
  if (!isOnlineMode()) return []

  const { data, error } = await supabase
    .from('gameplan_plays')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching gameplan plays:', error)
    return []
  }
  return (data || []).map(transformGameplanPlay)
}

export async function createGameplanPlay(
  projectId: string,
  input: CreateGameplanPlayInput
): Promise<GameplanPlay | null> {
  if (!isOnlineMode()) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()
  const profileOrgId = profile?.organization_id ?? null

  const { data: projectRow } = await supabase
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .single()
  const orgId = projectRow?.organization_id || profileOrgId || 'default-org'

  const row = {
    project_id: projectId,
    organization_id: orgId,
    chapter_key: input.chapterKey,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    owner: input.owner,
    status: input.status ?? 'NOT_STARTED',
    target_start: input.targetStart?.trim() || null,
    target_finish: input.targetFinish?.trim() || null,
    sort_order: input.sortOrder ?? 0,
  }

  const { data, error } = await supabase
    .from('gameplan_plays')
    .insert(row)
    .select()
    .single()

  if (error) {
    console.error('Error creating gameplan play:', error)
    return null
  }
  return transformGameplanPlay(data)
}

export async function updateGameplanPlay(
  id: string,
  updates: UpdateGameplanPlayInput
): Promise<GameplanPlay | null> {
  if (!isOnlineMode()) return null

  const updateData: Record<string, unknown> = {}
  if (updates.title !== undefined) updateData.title = updates.title.trim()
  if (updates.description !== undefined) updateData.description = updates.description?.trim() || null
  if (updates.owner !== undefined) updateData.owner = updates.owner
  if (updates.status !== undefined) updateData.status = updates.status
  if (updates.targetStart !== undefined) updateData.target_start = updates.targetStart
  if (updates.targetFinish !== undefined) updateData.target_finish = updates.targetFinish
  if (updates.sortOrder !== undefined) updateData.sort_order = updates.sortOrder

  if (Object.keys(updateData).length === 0) {
    const { data: existing } = await supabase.from('gameplan_plays').select('*').eq('id', id).single()
    return existing ? transformGameplanPlay(existing) : null
  }

  const { data, error } = await supabase
    .from('gameplan_plays')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating gameplan play:', error)
    return null
  }
  return transformGameplanPlay(data)
}

export async function deleteGameplanPlay(id: string): Promise<boolean> {
  if (!isOnlineMode()) return false
  const { error } = await supabase.from('gameplan_plays').delete().eq('id', id)
  if (error) {
    console.error('Error deleting gameplan play:', error)
    return false
  }
  return true
}

export async function deleteGameplanPlaysByProject(projectId: string): Promise<boolean> {
  if (!isOnlineMode()) return false
  const { error } = await supabase.from('gameplan_plays').delete().eq('project_id', projectId)
  if (error) {
    console.error('Error deleting gameplan plays by project:', error)
    return false
  }
  return true
}

// ============================================================================
// GAMEPLAN PLAYBOOK (org-level template)
// ============================================================================

function transformPlaybookPlay(row: any): PlaybookPlay {
  return {
    id: row.id,
    organizationId: row.organization_id,
    chapterKey: row.chapter_key,
    title: row.title,
    description: row.description ?? null,
    owner: row.owner,
    sortOrder: row.sort_order ?? 0,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export async function fetchPlaybookPlays(organizationId: string): Promise<PlaybookPlay[]> {
  if (!isOnlineMode()) return []

  const { data, error } = await supabase
    .from('gameplan_playbook')
    .select('*')
    .eq('organization_id', organizationId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching playbook plays:', error)
    return []
  }
  return (data || []).map(transformPlaybookPlay)
}

export async function createPlaybookPlay(
  organizationId: string,
  input: CreatePlaybookPlayInput
): Promise<PlaybookPlay | null> {
  if (!isOnlineMode()) return null

  const row = {
    organization_id: organizationId,
    chapter_key: input.chapterKey,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    owner: input.owner,
    sort_order: input.sortOrder ?? 0,
  }

  const { data, error } = await supabase
    .from('gameplan_playbook')
    .insert(row)
    .select()
    .single()

  if (error) {
    console.error('Error creating playbook play:', error)
    return null
  }
  return transformPlaybookPlay(data)
}

export async function updatePlaybookPlay(
  id: string,
  updates: UpdatePlaybookPlayInput
): Promise<PlaybookPlay | null> {
  if (!isOnlineMode()) return null

  const updateData: Record<string, unknown> = {}
  if (updates.title !== undefined) updateData.title = updates.title.trim()
  if (updates.description !== undefined) updateData.description = updates.description?.trim() || null
  if (updates.owner !== undefined) updateData.owner = updates.owner
  if (updates.sortOrder !== undefined) updateData.sort_order = updates.sortOrder

  if (Object.keys(updateData).length === 0) {
    const { data: existing } = await supabase.from('gameplan_playbook').select('*').eq('id', id).single()
    return existing ? transformPlaybookPlay(existing) : null
  }

  const { data, error } = await supabase
    .from('gameplan_playbook')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating playbook play:', error)
    return null
  }
  return transformPlaybookPlay(data)
}

export async function deletePlaybookPlay(id: string): Promise<boolean> {
  if (!isOnlineMode()) return false
  const { error } = await supabase.from('gameplan_playbook').delete().eq('id', id)
  if (error) {
    console.error('Error deleting playbook play:', error)
    return false
  }
  return true
}

export async function deleteAllPlaybookPlays(organizationId: string): Promise<boolean> {
  if (!isOnlineMode()) return false
  const { error } = await supabase.from('gameplan_playbook').delete().eq('organization_id', organizationId)
  if (error) {
    console.error('Error deleting all playbook plays:', error)
    return false
  }
  return true
}

// ============================================================================
// GAMEPLAN DEFAULT PLAYBOOK (global HSH default, admin can edit)
// ============================================================================

function transformDefaultPlaybookPlay(row: any): DefaultPlaybookPlay {
  return {
    id: row.id,
    chapterKey: row.chapter_key,
    title: row.title,
    description: row.description ?? null,
    owner: row.owner,
    sortOrder: row.sort_order ?? 0,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export async function fetchDefaultPlaybookPlays(): Promise<DefaultPlaybookPlay[]> {
  if (!isOnlineMode()) return []

  const { data, error } = await supabase
    .from('gameplan_default_playbook')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching default playbook:', error)
    return []
  }
  return (data || []).map(transformDefaultPlaybookPlay)
}

export async function createDefaultPlaybookPlay(input: CreateDefaultPlaybookPlayInput): Promise<DefaultPlaybookPlay | null> {
  if (!isOnlineMode()) return null

  const row = {
    chapter_key: input.chapterKey,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    owner: input.owner,
    sort_order: input.sortOrder ?? 0,
  }

  const { data, error } = await supabase
    .from('gameplan_default_playbook')
    .insert(row)
    .select()
    .single()

  if (error) {
    console.error('Error creating default playbook play:', error)
    return null
  }
  return transformDefaultPlaybookPlay(data)
}

export async function updateDefaultPlaybookPlay(
  id: string,
  updates: UpdateDefaultPlaybookPlayInput
): Promise<DefaultPlaybookPlay | null> {
  if (!isOnlineMode()) return null

  const updateData: Record<string, unknown> = {}
  if (updates.title !== undefined) updateData.title = updates.title.trim()
  if (updates.description !== undefined) updateData.description = updates.description?.trim() || null
  if (updates.owner !== undefined) updateData.owner = updates.owner
  if (updates.sortOrder !== undefined) updateData.sort_order = updates.sortOrder

  if (Object.keys(updateData).length === 0) {
    const { data: existing } = await supabase.from('gameplan_default_playbook').select('*').eq('id', id).single()
    return existing ? transformDefaultPlaybookPlay(existing) : null
  }

  const { data, error } = await supabase
    .from('gameplan_default_playbook')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating default playbook play:', error)
    return null
  }
  return transformDefaultPlaybookPlay(data)
}

export async function deleteDefaultPlaybookPlay(id: string): Promise<boolean> {
  if (!isOnlineMode()) return false
  const { error } = await supabase.from('gameplan_default_playbook').delete().eq('id', id)
  if (error) {
    console.error('Error deleting default playbook play:', error)
    return false
  }
  return true
}

export async function deleteAllDefaultPlaybookPlays(): Promise<boolean> {
  if (!isOnlineMode()) return false
  const { error } = await supabase.from('gameplan_default_playbook').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) {
    console.error('Error deleting all default playbook plays:', error)
    return false
  }
  return true
}

// ============================================================================
// ESTIMATE OPERATIONS
// ============================================================================

export async function fetchEstimateByProjectId(projectId: string): Promise<any | null> {
  if (!isOnlineMode()) return null

  const { data, error } = await supabase
    .from('estimates')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (error) {
    console.error('Error fetching estimate:', error)
    return null
  }

  if (!data || data.length === 0) {
    return null
  }

  const estimate = data[0]
  const totals = estimate.totals as {
    basePriceTotal?: number
    contingency?: number
    totalEstimated?: number
    total_estimated?: number
  } | null
  const totalEstimated = totals?.totalEstimated ?? (totals as any)?.total_estimated

  return {
    id: estimate.id,
    projectId: estimate.project_id,
    version: 1,
    trades: [],
    subtotal: totals?.basePriceTotal ?? 0,
    overhead: 0,
    profit: 0,
    contingency: totals?.contingency ?? 0,
    totalEstimate: totalEstimated ?? 0,
    totals: estimate.totals ?? undefined,
    createdAt: new Date(estimate.created_at),
    updatedAt: new Date(estimate.updated_at),
  }
}

export async function createEstimateInDB(projectId: string): Promise<any | null> {
  if (!isOnlineMode()) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Get user's organization
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    console.error('User profile not found')
    return null
  }

  const { data, error } = await supabase
    .from('estimates')
    .insert({
      project_id: projectId,
      user_id: user.id,
      organization_id: profile.organization_id,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating estimate:', error)
    return null
  }

  return {
    id: data.id,
    projectId: data.project_id,
    version: 1,
    trades: [],
    subtotal: 0,
    overhead: 0,
    profit: 0,
    contingency: 0,
    totalEstimate: 0,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  }
}

export async function updateEstimateTotalsInDB(estimateId: string, totals: any): Promise<boolean> {
  if (!isOnlineMode()) return false

  const { error } = await supabase
    .from('estimates')
    .update({ totals })
    .eq('id', estimateId)

  if (error) {
    console.error('Error updating estimate totals:', error)
    return false
  }

  return true
}

// ============================================================================
// TRADE OPERATIONS
// ============================================================================

// Helper to transform database row to Trade
function transformTrade(row: any): Trade {
  return {
    id: row.id,
    estimateId: row.estimate_id,
    category: row.category,
    group: row.group,
    name: row.name,
    description: row.description || '',
    quantity: row.quantity,
    unit: row.unit,
    laborCost: row.labor_cost || 0,
    laborRate: row.labor_rate || 0,
    laborHours: row.labor_hours || 0,
    materialCost: row.material_cost || 0,
    materialRate: row.material_rate || 0,
    subcontractorCost: row.subcontractor_cost || 0,
    subcontractorRate: row.subcontractor_rate || 0,
    totalCost: row.total_cost || 0,
    budgetTotalCost: row.budget_total_cost != null ? row.budget_total_cost : undefined,
    isSubcontracted: row.is_subcontracted || false,
    wasteFactor: row.waste_factor || 10,
    markupPercent: row.markup_percent || 0,
    estimateStatus: row.estimate_status || 'budget',
    quoteVendor: row.quote_vendor,
    quoteDate: row.quote_date ? new Date(row.quote_date) : undefined,
    quoteReference: row.quote_reference,
    quoteFileUrl: row.quote_file_url,
    notes: row.notes || '',
    sortOrder: 0,
  }
}

export async function fetchTradesForEstimate(estimateId: string): Promise<Trade[]> {
  if (!isOnlineMode()) return []

  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('estimate_id', estimateId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching trades:', error)
    return []
  }

  // Fetch sub-items for each trade
  const trades = await Promise.all(
    data.map(async (row) => {
      const trade = transformTrade(row)
      const subItems = await fetchSubItemsForTrade(trade.id)
      return { ...trade, subItems }
    })
  )

  return trades
}

export async function createTradeInDB(estimateId: string, input: TradeInput): Promise<Trade | null> {
  if (!isOnlineMode()) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Get user's organization
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    console.error('User profile not found')
    return null
  }

  const totalCost = (input.laborCost || 0) + (input.materialCost || 0) + (input.subcontractorCost || 0)

  const { data, error} = await supabase
    .from('trades')
    .insert({
      estimate_id: estimateId,
      category: input.category,
      name: input.name,
      description: input.description || '',
      quantity: input.quantity || 1,
      unit: input.unit || 'each',
      labor_cost: input.laborCost || 0,
      labor_rate: input.laborRate || 0,
      labor_hours: input.laborHours || 0,
      material_cost: input.materialCost || 0,
      material_rate: input.materialRate || 0,
      subcontractor_cost: input.subcontractorCost || 0,
      subcontractor_rate: input.subcontractorRate || 0,
      total_cost: totalCost,
      budget_total_cost: totalCost,
      is_subcontracted: input.isSubcontracted || false,
      waste_factor: input.wasteFactor || 10,
      markup_percent: input.markupPercent || 0,
      notes: input.notes || '',
      estimate_status: (input as any).estimateStatus || 'budget',
      quote_vendor: (input as any).quoteVendor || null,
      quote_date: (input as any).quoteDate || null,
      quote_reference: (input as any).quoteReference || null,
      quote_file_url: (input as any).quoteFileUrl || null,
      user_id: user.id,
      organization_id: profile.organization_id,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating trade:', error)
    return null
  }

  return transformTrade(data)
}

export async function updateTradeInDB(tradeId: string, updates: Partial<TradeInput>): Promise<Trade | null> {
  if (!isOnlineMode()) return null

  // Fetch existing trade to get current values if cost fields aren't being updated
  const { data: existingTrade } = await supabase
    .from('trades')
    .select('labor_cost, material_cost, subcontractor_cost, estimate_status')
    .eq('id', tradeId)
    .single()

  // Calculate totalCost using updated values or existing values (or use explicit totalCost when reverting quote)
  const laborCost = updates.laborCost !== undefined ? updates.laborCost : (existingTrade?.labor_cost || 0)
  const materialCost = updates.materialCost !== undefined ? updates.materialCost : (existingTrade?.material_cost || 0)
  const subcontractorCost = updates.subcontractorCost !== undefined ? updates.subcontractorCost : (existingTrade?.subcontractor_cost || 0)
  const totalCost = (updates as any).totalCost !== undefined ? (updates as any).totalCost : (laborCost + materialCost + subcontractorCost)

  const updateData: any = {}
  if (updates.category !== undefined) updateData.category = updates.category
  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.description !== undefined) updateData.description = updates.description
  if (updates.quantity !== undefined) updateData.quantity = updates.quantity
  if (updates.unit !== undefined) updateData.unit = updates.unit
  if (updates.laborCost !== undefined) updateData.labor_cost = updates.laborCost
  if (updates.laborRate !== undefined) updateData.labor_rate = updates.laborRate
  if (updates.laborHours !== undefined) updateData.labor_hours = updates.laborHours
  if (updates.materialCost !== undefined) updateData.material_cost = updates.materialCost
  if (updates.materialRate !== undefined) updateData.material_rate = updates.materialRate
  if (updates.subcontractorCost !== undefined) updateData.subcontractor_cost = updates.subcontractorCost
  if (updates.subcontractorRate !== undefined) updateData.subcontractor_rate = updates.subcontractorRate
  if (updates.isSubcontracted !== undefined) updateData.is_subcontracted = updates.isSubcontracted
  if (updates.wasteFactor !== undefined) updateData.waste_factor = updates.wasteFactor
  if (updates.markupPercent !== undefined) updateData.markup_percent = updates.markupPercent
  if (updates.notes !== undefined) updateData.notes = updates.notes
  if ((updates as any).estimateStatus !== undefined) updateData.estimate_status = (updates as any).estimateStatus
  if ((updates as any).quoteVendor !== undefined) updateData.quote_vendor = (updates as any).quoteVendor
  if ((updates as any).quoteDate !== undefined) updateData.quote_date = (updates as any).quoteDate
  if ((updates as any).quoteReference !== undefined) updateData.quote_reference = (updates as any).quoteReference
  if ((updates as any).quoteFileUrl !== undefined) updateData.quote_file_url = (updates as any).quoteFileUrl
  if ((updates as any).budgetTotalCost !== undefined) {
    updateData.budget_total_cost = (updates as any).budgetTotalCost
  } else if (
    existingTrade?.estimate_status === 'budget' &&
    (updates as any).estimateStatus !== 'quoted' &&
    (updates as any).estimateStatus !== 'approved'
  ) {
    // Keep budget in sync with estimate book until a quote is accepted
    updateData.budget_total_cost = totalCost
  }

  // Always update total_cost to ensure it's correct (calculated from existing or updated values)
  updateData.total_cost = totalCost

  // Check if there's anything to update
  if (Object.keys(updateData).length === 0) {
    console.warn('No fields to update for trade:', tradeId)
    // Fetch the existing trade and return it
    const { data: existing } = await supabase
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single()
    
    if (existing) {
      return transformTrade(existing)
    }
    return null
  }

  const { data, error } = await supabase
    .from('trades')
    .update(updateData)
    .eq('id', tradeId)
    .select()
    .single()

  if (error) {
    console.error('Error updating trade:', error)
    return null
  }

  if (!data) {
    console.error('Update succeeded but no data returned for trade:', tradeId)
    // Try to fetch the trade directly
    const { data: fetched } = await supabase
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single()
    
    if (fetched) {
      return transformTrade(fetched)
    }
    return null
  }

  return transformTrade(data)
}

export async function deleteTradeFromDB(tradeId: string): Promise<boolean> {
  if (!isOnlineMode()) return false

  const { error } = await supabase
    .from('trades')
    .delete()
    .eq('id', tradeId)

  if (error) {
    console.error('Error deleting trade:', error)
    return false
  }

  return true
}

export async function deleteAllTradesForEstimate(estimateId: string): Promise<boolean> {
  if (!isOnlineMode()) return false

  const { error } = await supabase
    .from('trades')
    .delete()
    .eq('estimate_id', estimateId)

  if (error) {
    console.error('Error deleting all trades:', error)
    return false
  }

  return true
}

// ============================================================================
// SUB-ITEMS OPERATIONS
// ============================================================================

function transformSubItem(row: any): SubItem {
  return {
    id: row.id,
    tradeId: row.trade_id,
    name: row.name,
    description: row.description || '',
    quantity: row.quantity || 0,
    unit: row.unit,
    laborCost: row.labor_cost || 0,
    laborRate: row.labor_rate || 0,
    laborHours: row.labor_hours || 0,
    materialCost: row.material_cost || 0,
    materialRate: row.material_rate || 0,
    subcontractorCost: row.subcontractor_cost || 0,
    subcontractorRate: row.subcontractor_rate || 0,
    totalCost: row.total_cost || 0,
    isSubcontracted: row.is_subcontracted || false,
    wasteFactor: row.waste_factor || 10,
    markupPercent: row.markup_percent || 0,
    estimateStatus: row.estimate_status || 'budget',
    quoteVendor: row.quote_vendor,
    quoteDate: row.quote_date ? new Date(row.quote_date) : undefined,
    quoteReference: row.quote_reference,
    quoteFileUrl: row.quote_file_url,
    notes: row.notes || '',
    sortOrder: row.sort_order || 0,
  }
}

export async function fetchSubItemsForTrade(tradeId: string): Promise<SubItem[]> {
  if (!isOnlineMode()) return []

  const { data, error } = await supabase
    .from('sub_items')
    .select('*')
    .eq('trade_id', tradeId)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('Error fetching sub-items:', error)
    return []
  }

  return data.map(transformSubItem)
}

export async function createSubItemInDB(
  tradeId: string,
  estimateId: string,
  input: {
    name: string
    description?: string
    quantity: number
    unit: string
    laborCost: number
    laborRate?: number
    laborHours?: number
    materialCost: number
    materialRate?: number
    subcontractorCost: number
    subcontractorRate?: number
    isSubcontracted: boolean
    wasteFactor?: number
    markupPercent?: number
    estimateStatus?: string
    quoteVendor?: string
    quoteDate?: Date
    quoteReference?: string
    quoteFileUrl?: string
    notes?: string
    sortOrder?: number
  }
): Promise<SubItem | null> {
  if (!isOnlineMode()) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Get user's organization
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    console.error('User profile not found')
    return null
  }

  // Get existing sub-items to set sort order
  const existingSubItems = await fetchSubItemsForTrade(tradeId)
  const sortOrder = input.sortOrder !== undefined ? input.sortOrder : existingSubItems.length

  const totalCost = (input.laborCost || 0) + (input.materialCost || 0) + (input.subcontractorCost || 0)

  const { data, error } = await supabase
    .from('sub_items')
    .insert({
      trade_id: tradeId,
      estimate_id: estimateId,
      organization_id: profile.organization_id,
      name: input.name,
      description: input.description || '',
      quantity: input.quantity || 0,
      unit: input.unit,
      labor_cost: input.laborCost || 0,
      labor_rate: input.laborRate || 0,
      labor_hours: input.laborHours || 0,
      material_cost: input.materialCost || 0,
      material_rate: input.materialRate || 0,
      subcontractor_cost: input.subcontractorCost || 0,
      subcontractor_rate: input.subcontractorRate || 0,
      total_cost: totalCost,
      is_subcontracted: input.isSubcontracted || false,
      waste_factor: input.wasteFactor || 10,
      markup_percent: input.markupPercent || 0,
      estimate_status: input.estimateStatus || 'budget',
      quote_vendor: input.quoteVendor || null,
      quote_date: input.quoteDate || null,
      quote_reference: input.quoteReference || null,
      quote_file_url: input.quoteFileUrl || null,
      notes: input.notes || '',
      sort_order: sortOrder,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating sub-item:', error)
    return null
  }

  // Recalculate parent trade totals
  await recalculateTradeTotals(tradeId)

  return transformSubItem(data)
}

export async function updateSubItemInDB(
  subItemId: string,
  updates: Partial<{
    name: string
    description: string
    quantity: number
    unit: string
    laborCost: number
    laborRate: number
    laborHours: number
    materialCost: number
    materialRate: number
    subcontractorCost: number
    isSubcontracted: boolean
    wasteFactor: number
    markupPercent: number
    estimateStatus: string
    quoteVendor: string
    quoteDate: Date
    quoteReference: string
    quoteFileUrl: string
    notes: string
    sortOrder: number
  }>
): Promise<SubItem | null> {
  if (!isOnlineMode()) return null

  // Calculate total cost if cost fields are being updated
  let totalCost: number | undefined
  if (
    updates.laborCost !== undefined ||
    updates.materialCost !== undefined ||
    updates.subcontractorCost !== undefined
  ) {
    // Need to fetch current values for fields not being updated
    const { data: current } = await supabase
      .from('sub_items')
      .select('labor_cost, material_cost, subcontractor_cost')
      .eq('id', subItemId)
      .single()

    if (current) {
      totalCost =
        (updates.laborCost ?? current.labor_cost) +
        (updates.materialCost ?? current.material_cost) +
        (updates.subcontractorCost ?? current.subcontractor_cost)
    }
  }

  const updateData: any = {}
  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.description !== undefined) updateData.description = updates.description
  if (updates.quantity !== undefined) updateData.quantity = updates.quantity
  if (updates.unit !== undefined) updateData.unit = updates.unit
  if (updates.laborCost !== undefined) updateData.labor_cost = updates.laborCost
  if (updates.laborRate !== undefined) updateData.labor_rate = updates.laborRate
  if (updates.laborHours !== undefined) updateData.labor_hours = updates.laborHours
  if (updates.materialCost !== undefined) updateData.material_cost = updates.materialCost
  if (updates.materialRate !== undefined) updateData.material_rate = updates.materialRate
  if (updates.subcontractorCost !== undefined) updateData.subcontractor_cost = updates.subcontractorCost
  if ((updates as any).subcontractorRate !== undefined) updateData.subcontractor_rate = (updates as any).subcontractorRate
  if (updates.isSubcontracted !== undefined) updateData.is_subcontracted = updates.isSubcontracted
  if (updates.wasteFactor !== undefined) updateData.waste_factor = updates.wasteFactor
  if (updates.markupPercent !== undefined) updateData.markup_percent = updates.markupPercent
  if (updates.estimateStatus !== undefined) updateData.estimate_status = updates.estimateStatus
  if (updates.quoteVendor !== undefined) updateData.quote_vendor = updates.quoteVendor
  if (updates.quoteDate !== undefined) updateData.quote_date = updates.quoteDate
  if (updates.quoteReference !== undefined) updateData.quote_reference = updates.quoteReference
  if (updates.quoteFileUrl !== undefined) updateData.quote_file_url = updates.quoteFileUrl
  if (updates.notes !== undefined) updateData.notes = updates.notes
  if (updates.sortOrder !== undefined) updateData.sort_order = updates.sortOrder
  if (totalCost !== undefined) updateData.total_cost = totalCost

  const { data, error } = await supabase
    .from('sub_items')
    .update(updateData)
    .eq('id', subItemId)
    .select()
    .single()

  if (error) {
    console.error('Error updating sub-item:', error)
    return null
  }

  // Recalculate parent trade totals
  if (data) {
    await recalculateTradeTotals(data.trade_id)
  }

  return transformSubItem(data)
}

export async function deleteSubItemFromDB(subItemId: string): Promise<boolean> {
  if (!isOnlineMode()) return false

  // Get trade ID before deleting
  const { data: subItem } = await supabase
    .from('sub_items')
    .select('trade_id')
    .eq('id', subItemId)
    .single()

  const { error } = await supabase
    .from('sub_items')
    .delete()
    .eq('id', subItemId)

  if (error) {
    console.error('Error deleting sub-item:', error)
    return false
  }

  // Recalculate parent trade totals
  if (subItem) {
    await recalculateTradeTotals(subItem.trade_id)
  }

  return true
}

// Helper function to recalculate trade totals from sub-items
async function recalculateTradeTotals(tradeId: string): Promise<void> {
  const subItems = await fetchSubItemsForTrade(tradeId)
  
  // Sum up sub-item costs
  const totalLaborCost = subItems.reduce((sum, item) => sum + (item.laborCost || 0), 0)
  const totalMaterialCost = subItems.reduce((sum, item) => sum + (item.materialCost || 0), 0)
  const totalSubcontractorCost = subItems.reduce((sum, item) => sum + (item.subcontractorCost || 0), 0)
  
  // Get current trade to preserve non-sub-item costs
  const { data: trade } = await supabase
    .from('trades')
    .select('labor_cost, material_cost, subcontractor_cost')
    .eq('id', tradeId)
    .single()

  if (trade) {
    // If trade has sub-items, use sub-item totals; otherwise keep existing values
    const newLaborCost = subItems.length > 0 ? totalLaborCost : trade.labor_cost
    const newMaterialCost = subItems.length > 0 ? totalMaterialCost : trade.material_cost
    const newSubcontractorCost = subItems.length > 0 ? totalSubcontractorCost : trade.subcontractor_cost
    const newTotalCost = newLaborCost + newMaterialCost + newSubcontractorCost

    await supabase
      .from('trades')
      .update({
        labor_cost: newLaborCost,
        material_cost: newMaterialCost,
        subcontractor_cost: newSubcontractorCost,
        total_cost: newTotalCost,
      })
      .eq('id', tradeId)
  }
}

// ============================================================================
// ACTUAL ENTRIES OPERATIONS
// ============================================================================

export async function fetchLaborEntries(projectId: string): Promise<any[]> {
  if (!isOnlineMode()) return []

  const { data, error } = await supabase
    .from('labor_entries')
    .select('*')
    .eq('project_id', projectId)
    .order('date', { ascending: false })

  if (error) {
    console.error('Error fetching labor entries:', error)
    return []
  }

  return data.map(entry => ({
    id: entry.id,
    projectId: entry.project_id,
    tradeId: entry.trade_id,
    date: new Date(entry.date),
    trade: entry.category,
    description: entry.description,
    totalHours: entry.hours,
    laborRate: entry.hourly_rate,
    totalCost: entry.amount,
    grossWages: entry.gross_wages != null ? Number(entry.gross_wages) : undefined,
    burdenAmount: entry.burden_amount != null ? Number(entry.burden_amount) : undefined,
    crew: [],
    createdAt: new Date(entry.created_at),
  }))
}

export async function fetchMaterialEntries(projectId: string): Promise<any[]> {
  if (!isOnlineMode()) return []

  const { data, error } = await supabase
    .from('material_entries')
    .select('*')
    .eq('project_id', projectId)
    .order('date', { ascending: false })

  if (error) {
    console.error('Error fetching material entries:', error)
    return []
  }

  return data.map(entry => ({
    id: entry.id,
    projectId: entry.project_id,
    tradeId: entry.trade_id,
    date: new Date(entry.date),
    materialName: entry.description,
    category: entry.category,
    quantity: entry.quantity,
    unit: 'each',
    unitCost: entry.unit_cost,
    totalCost: entry.amount,
    vendor: entry.vendor,
    invoiceNumber: entry.invoice_number,
    createdAt: new Date(entry.created_at),
  }))
}

export async function fetchSubcontractorEntries(projectId: string): Promise<any[]> {
  if (!isOnlineMode()) return []

  const { data, error} = await supabase
    .from('subcontractor_entries')
    .select('*')
    .eq('project_id', projectId)
    .order('date', { ascending: false })

  if (error) {
    console.error('Error fetching subcontractor entries:', error)
    return []
  }

  return data.map(entry => ({
    id: entry.id,
    projectId: entry.project_id,
    tradeId: entry.trade_id,
    subcontractor: {
      name: entry.subcontractor_name,
      company: entry.subcontractor_name,
      email: '',
      phone: '',
    },
    trade: entry.category,
    scopeOfWork: entry.description,
    contractAmount: entry.amount,
    payments: [],
    totalPaid: entry.amount,
    balance: 0,
    createdAt: new Date(entry.created_at),
  }))
}

export async function createLaborEntryInDB(projectId: string, entry: any): Promise<any | null> {
  if (!isOnlineMode()) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Get user's organization
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    console.error('User profile not found')
    return null
  }

  // Get or create project actuals
  const actualsId = await getOrCreateActualsId(projectId)
  if (!actualsId) return null

  const { data, error } = await supabase
    .from('labor_entries')
    .insert({
      user_id: user.id,
      organization_id: profile.organization_id,
      entered_by: user.id,
      project_id: projectId,
      actuals_id: actualsId,
      category: entry.trade || entry.category,
      trade_id: entry.tradeId || null,
      sub_item_id: entry.subItemId || null,
      description: entry.description,
      date: entry.date.toISOString(),
      hours: entry.totalHours || 0,
      hourly_rate: entry.laborRate || 0,
      amount: entry.totalCost,
      worker_name: entry.workerName || '',
      notes: entry.notes || '',
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating labor entry:', error)
    return null
  }

  return {
    id: data.id,
    projectId: data.project_id,
    tradeId: data.trade_id,
    date: new Date(data.date),
    trade: data.category,
    description: data.description,
    totalHours: data.hours,
    laborRate: data.hourly_rate,
    totalCost: data.amount,
    crew: [],
    createdAt: new Date(data.created_at),
  }
}

export async function updateLaborEntryInDB(entryId: string, updates: any): Promise<any | null> {
  if (!isOnlineMode()) return null

  const updateData: any = {}
  if (updates.date !== undefined) updateData.date = updates.date.toISOString()
  if (updates.description !== undefined) updateData.description = updates.description
  if (updates.totalCost !== undefined) updateData.amount = updates.totalCost
  if (updates.totalHours !== undefined) updateData.hours = updates.totalHours
  if (updates.laborRate !== undefined) updateData.hourly_rate = updates.laborRate
  if (updates.tradeId !== undefined) updateData.trade_id = updates.tradeId
  if (updates.subItemId !== undefined) updateData.sub_item_id = updates.subItemId

  const { data, error } = await supabase
    .from('labor_entries')
    .update(updateData)
    .eq('id', entryId)
    .select()
    .single()

  if (error) {
    console.error('Error updating labor entry:', error)
    return null
  }

  return {
    id: data.id,
    projectId: data.project_id,
    tradeId: data.trade_id,
    date: new Date(data.date),
    trade: data.category,
    description: data.description,
    totalHours: data.hours,
    laborRate: data.hourly_rate,
    totalCost: data.amount,
    crew: [],
    createdAt: new Date(data.created_at),
  }
}

export async function deleteLaborEntryFromDB(entryId: string): Promise<boolean> {
  if (!isOnlineMode()) return false

  const { error } = await supabase
    .from('labor_entries')
    .delete()
    .eq('id', entryId)

  if (error) {
    console.error('Error deleting labor entry:', error)
    return false
  }

  return true
}

// Material Entries
export async function createMaterialEntryInDB(projectId: string, entry: any): Promise<any | null> {
  if (!isOnlineMode()) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    console.error('User profile not found')
    return null
  }

  const actualsId = await getOrCreateActualsId(projectId)
  if (!actualsId) return null

  const { data, error } = await supabase
    .from('material_entries')
    .insert({
      user_id: user.id,
      organization_id: profile.organization_id,
      entered_by: user.id,
      project_id: projectId,
      actuals_id: actualsId,
      category: entry.category,
      trade_id: entry.tradeId,
      sub_item_id: entry.subItemId || null,
      group: entry.group,
      description: entry.materialName,
      date: entry.date.toISOString(),
      quantity: entry.quantity || 0,
      unit_cost: entry.unitCost || 0,
      amount: entry.totalCost,
      vendor: entry.vendor || '',
      invoice_number: entry.invoiceNumber || '',
      is_split_entry: entry.isSplitEntry || false,
      split_parent_id: entry.splitParentId || null,
      split_allocation: entry.splitAllocation || null,
      notes: entry.notes || '',
      qb_transaction_id: entry.qbTransactionId || null,
      qb_transaction_type: entry.qbTransactionType || null,
      qb_line_id: entry.qbLineId ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating material entry:', error)
    return null
  }

  return {
    id: data.id,
    projectId: data.project_id,
    tradeId: data.trade_id,
    date: new Date(data.date),
    materialName: data.description,
    category: data.category,
    quantity: data.quantity,
    unit: 'each',
    unitCost: data.unit_cost,
    totalCost: data.amount,
    vendor: data.vendor,
    invoiceNumber: data.invoice_number,
    createdAt: new Date(data.created_at),
  }
}

export async function updateMaterialEntryInDB(entryId: string, updates: any): Promise<any | null> {
  if (!isOnlineMode()) return null

  const updateData: any = {}
  if (updates.date !== undefined) updateData.date = updates.date.toISOString()
  if (updates.materialName !== undefined) updateData.description = updates.materialName
  if (updates.totalCost !== undefined) updateData.amount = updates.totalCost
  if (updates.quantity !== undefined) updateData.quantity = updates.quantity
  if (updates.unitCost !== undefined) updateData.unit_cost = updates.unitCost
  if (updates.vendor !== undefined) updateData.vendor = updates.vendor
  if (updates.invoiceNumber !== undefined) updateData.invoice_number = updates.invoiceNumber
  if (updates.category !== undefined) updateData.category = updates.category
  if (updates.tradeId !== undefined) updateData.trade_id = updates.tradeId
  if (updates.subItemId !== undefined) updateData.sub_item_id = updates.subItemId
  if (updates.group !== undefined) updateData.group = updates.group
  if (updates.isSplitEntry !== undefined) updateData.is_split_entry = updates.isSplitEntry
  if (updates.splitParentId !== undefined) updateData.split_parent_id = updates.splitParentId
  if (updates.splitAllocation !== undefined) updateData.split_allocation = updates.splitAllocation

  const { data, error } = await supabase
    .from('material_entries')
    .update(updateData)
    .eq('id', entryId)
    .select()
    .single()

  if (error) {
    console.error('Error updating material entry:', error)
    return null
  }

  return {
    id: data.id,
    projectId: data.project_id,
    tradeId: data.trade_id,
    date: new Date(data.date),
    materialName: data.description,
    category: data.category,
    quantity: data.quantity,
    unit: 'each',
    unitCost: data.unit_cost,
    totalCost: data.amount,
    vendor: data.vendor,
    invoiceNumber: data.invoice_number,
    createdAt: new Date(data.created_at),
  }
}

export async function deleteMaterialEntryFromDB(entryId: string): Promise<boolean> {
  if (!isOnlineMode()) return false

  const { error } = await supabase
    .from('material_entries')
    .delete()
    .eq('id', entryId)

  if (error) {
    console.error('Error deleting material entry:', error)
    return false
  }

  return true
}

// Subcontractor Entries
export async function createSubcontractorEntryInDB(projectId: string, entry: any): Promise<any | null> {
  if (!isOnlineMode()) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    console.error('User profile not found')
    return null
  }

  const actualsId = await getOrCreateActualsId(projectId)
  if (!actualsId) return null

  const { data, error } = await supabase
    .from('subcontractor_entries')
    .insert({
      user_id: user.id,
      organization_id: profile.organization_id,
      entered_by: user.id,
      project_id: projectId,
      actuals_id: actualsId,
      category: entry.trade,
      trade_id: entry.tradeId || null,
      sub_item_id: entry.subItemId || null,
      description: entry.scopeOfWork,
      date: (entry.date ? new Date(entry.date).toISOString() : new Date().toISOString()),
      amount: entry.totalPaid,
      subcontractor_name: entry.subcontractorName,
      invoice_number: entry.invoiceNumber || '',
      notes: entry.notes || '',
      qb_transaction_id: entry.qbTransactionId || null,
      qb_transaction_type: entry.qbTransactionType || null,
      qb_line_id: entry.qbLineId ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating subcontractor entry:', error)
    return null
  }

  return {
    id: data.id,
    projectId: data.project_id,
    tradeId: data.trade_id,
    subcontractor: {
      name: data.subcontractor_name,
      company: data.subcontractor_name,
      email: '',
      phone: '',
    },
    trade: data.category,
    scopeOfWork: data.description,
    contractAmount: data.amount,
    payments: [],
    totalPaid: data.amount,
    balance: 0,
    createdAt: new Date(data.created_at),
  }
}

export async function updateSubcontractorEntryInDB(entryId: string, updates: any): Promise<any | null> {
  if (!isOnlineMode()) return null

  const updateData: any = {}
  if (updates.scopeOfWork !== undefined) updateData.description = updates.scopeOfWork
  if (updates.totalPaid !== undefined) updateData.amount = updates.totalPaid
  if (updates.subcontractorName !== undefined) updateData.subcontractor_name = updates.subcontractorName
  if (updates.tradeId !== undefined) updateData.trade_id = updates.tradeId
  if (updates.subItemId !== undefined) updateData.sub_item_id = updates.subItemId

  const { data, error } = await supabase
    .from('subcontractor_entries')
    .update(updateData)
    .eq('id', entryId)
    .select()
    .single()

  if (error) {
    console.error('Error updating subcontractor entry:', error)
    return null
  }

  return {
    id: data.id,
    projectId: data.project_id,
    tradeId: data.trade_id,
    subcontractor: {
      name: data.subcontractor_name,
      company: data.subcontractor_name,
      email: '',
      phone: '',
    },
    trade: data.category,
    scopeOfWork: data.description,
    contractAmount: data.amount,
    payments: [],
    totalPaid: data.amount,
    balance: 0,
    createdAt: new Date(data.created_at),
  }
}

export async function deleteSubcontractorEntryFromDB(entryId: string): Promise<boolean> {
  if (!isOnlineMode()) return false

  const { error } = await supabase
    .from('subcontractor_entries')
    .delete()
    .eq('id', entryId)

  if (error) {
    console.error('Error deleting subcontractor entry:', error)
    return false
  }

  return true
}

// Helper to get or create actuals ID for a project
async function getOrCreateActualsId(projectId: string): Promise<string | null> {
  // Check if project actuals exists
  const { data: existing, error: fetchError } = await supabase
    .from('project_actuals')
    .select('id')
    .eq('project_id', projectId)
    .limit(1)

  if (existing && existing.length > 0) {
    return existing[0].id
  }

  // Create new actuals
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile) return null

  const { data: newActuals, error: createError } = await supabase
    .from('project_actuals')
    .insert({
      project_id: projectId,
      user_id: user.id,
      organization_id: profile.organization_id,
      labor_cost: 0,
      material_cost: 0,
      subcontractor_cost: 0,
      total_actual: 0,
    })
    .select()
    .single()

  if (createError || !newActuals) {
    console.error('Error creating actuals:', createError)
    return null
  }

  return newActuals.id
}

/** Reassign a material entry to another project (updates project_id and actuals_id). */
export async function reassignMaterialEntryToProject(entryId: string, newProjectId: string): Promise<any | null> {
  if (!isOnlineMode()) return null
  const actualsId = await getOrCreateActualsId(newProjectId)
  if (!actualsId) return null
  const updateData = { project_id: newProjectId, actuals_id: actualsId }
  const { data, error } = await supabase
    .from('material_entries')
    .update(updateData)
    .eq('id', entryId)
    .select()
    .single()
  if (error) {
    console.error('Error reassigning material entry:', error)
    return null
  }
  return {
    id: data.id,
    projectId: data.project_id,
    tradeId: data.trade_id,
    date: new Date(data.date),
    materialName: data.description,
    category: data.category,
    quantity: data.quantity,
    unit: 'each',
    unitCost: data.unit_cost,
    totalCost: data.amount,
    vendor: data.vendor,
    invoiceNumber: data.invoice_number,
    createdAt: new Date(data.created_at),
  }
}

/** Reassign a subcontractor entry to another project (updates project_id and actuals_id). */
export async function reassignSubcontractorEntryToProject(entryId: string, newProjectId: string): Promise<any | null> {
  if (!isOnlineMode()) return null
  const actualsId = await getOrCreateActualsId(newProjectId)
  if (!actualsId) return null
  const updateData = { project_id: newProjectId, actuals_id: actualsId }
  const { data, error } = await supabase
    .from('subcontractor_entries')
    .update(updateData)
    .eq('id', entryId)
    .select()
    .single()
  if (error) {
    console.error('Error reassigning subcontractor entry:', error)
    return null
  }
  return {
    id: data.id,
    projectId: data.project_id,
    tradeId: data.trade_id,
    subcontractor: { name: data.subcontractor_name, company: data.subcontractor_name, email: '', phone: '' },
    trade: data.category,
    scopeOfWork: data.description,
    contractAmount: data.amount,
    payments: [],
    totalPaid: data.amount,
    balance: 0,
    createdAt: new Date(data.created_at),
  }
}

// ============================================================================
// ESTIMATE TEMPLATE OPERATIONS
// ============================================================================

export async function fetchEstimateTemplates(): Promise<PlanEstimateTemplate[]> {
  if (!isOnlineMode()) return []

  const { data, error } = await supabase
    .from('estimate_templates')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching estimate templates:', error)
    return []
  }

  return data.map(template => ({
    id: template.id,
    name: template.name,
    description: template.description || undefined,
    trades: template.trades || [],
    defaultMarkupPercent: template.default_markup_percent,
    defaultContingencyPercent: template.default_contingency_percent,
    createdAt: new Date(template.created_at),
    updatedAt: new Date(template.updated_at),
    usageCount: template.usage_count || 0,
    linkedPlanIds: template.linked_plan_ids || [],
  })) as PlanEstimateTemplate[]
}

export async function createEstimateTemplateInDB(input: CreatePlanEstimateTemplateInput): Promise<PlanEstimateTemplate | null> {
  if (!isOnlineMode()) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Convert trades to template format
  const templateTrades = input.trades.map(trade => {
    const { id, estimateId, ...tradeData } = trade
    return tradeData
  })

  // Get user's organization
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    console.error('User profile not found')
    return null
  }

  const { data, error } = await supabase
    .from('estimate_templates')
    .insert({
      user_id: user.id,
      organization_id: profile.organization_id,
      name: input.name,
      description: input.description,
      trades: templateTrades,
      default_markup_percent: input.defaultMarkupPercent || 20,
      default_contingency_percent: input.defaultContingencyPercent || 10,
      usage_count: 0,
      linked_plan_ids: [],
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating estimate template:', error)
    return null
  }

  return {
    id: data.id,
    name: data.name,
    description: data.description || undefined,
    trades: data.trades || [],
    defaultMarkupPercent: data.default_markup_percent,
    defaultContingencyPercent: data.default_contingency_percent,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
    usageCount: data.usage_count || 0,
    linkedPlanIds: data.linked_plan_ids || [],
  } as PlanEstimateTemplate
}

export async function updateEstimateTemplateInDB(
  templateId: string,
  updates: UpdatePlanEstimateTemplateInput
): Promise<PlanEstimateTemplate | null> {
  if (!isOnlineMode()) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Build update object
  const updateData: any = {}
  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.description !== undefined) updateData.description = updates.description
  if (updates.trades !== undefined) {
    // Trades are already in template format (Omit<Trade, 'id' | 'estimateId'>)
    updateData.trades = updates.trades
  }
  if (updates.defaultMarkupPercent !== undefined) updateData.default_markup_percent = updates.defaultMarkupPercent
  if (updates.defaultContingencyPercent !== undefined) updateData.default_contingency_percent = updates.defaultContingencyPercent
  if (updates.usageCount !== undefined) updateData.usage_count = updates.usageCount
  if (updates.linkedPlanIds !== undefined) updateData.linked_plan_ids = updates.linkedPlanIds

  const { data, error } = await supabase
    .from('estimate_templates')
    .update(updateData)
    .eq('id', templateId)
    .select()
    .single()

  if (error) {
    console.error('Error updating estimate template:', error)
    return null
  }

  return {
    id: data.id,
    name: data.name,
    description: data.description || undefined,
    trades: data.trades || [],
    defaultMarkupPercent: data.default_markup_percent,
    defaultContingencyPercent: data.default_contingency_percent,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
    usageCount: data.usage_count || 0,
    linkedPlanIds: data.linked_plan_ids || [],
  } as PlanEstimateTemplate
}

export async function deleteEstimateTemplateFromDB(templateId: string): Promise<boolean> {
  if (!isOnlineMode()) return false

  const { error } = await supabase
    .from('estimate_templates')
    .delete()
    .eq('id', templateId)

  if (error) {
    console.error('Error deleting estimate template:', error)
    return false
  }

  return true
}

// ============================================================================
// ITEM TEMPLATE OPERATIONS
// ============================================================================

export async function fetchItemTemplates(): Promise<any[]> {
  if (!isOnlineMode()) return []

  const { data, error } = await supabase
    .from('item_templates')
    .select('*')
    .order('category', { ascending: true })

  if (error) {
    console.error('Error fetching item templates:', error)
    return []
  }

  return data.map(item => ({
    id: item.id,
    name: item.name,
    category: item.category,
    defaultUnit: item.default_unit,
    defaultMaterialRate: item.default_material_rate,
    defaultLaborRate: item.default_labor_rate,
    defaultSubcontractorRate: item.default_subcontractor_rate,
    defaultSubcontractorCost: item.default_subcontractor_cost,
    isSubcontracted: item.is_subcontracted,
    notes: item.notes || '',
    description: item.notes || '',
    rateSourceName: item.rate_source_name ?? null,
    rateSourceDate: item.rate_source_date ?? null,
    rateSourceNotes: item.rate_source_notes ?? null,
    createdAt: new Date(item.created_at),
    updatedAt: new Date(item.updated_at),
  }))
}

export async function createItemTemplateInDB(input: any): Promise<any | null> {
  if (!isOnlineMode()) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Get user's organization
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    console.error('User profile not found')
    return null
  }

  const { data, error } = await supabase
    .from('item_templates')
    .insert({
      name: input.name,
      category: input.category,
      default_unit: input.defaultUnit ?? 'each',
      default_material_rate: input.defaultMaterialRate || 0,
      default_labor_rate: input.defaultLaborRate || 0,
      default_subcontractor_rate: input.defaultSubcontractorRate ?? 0,
      default_subcontractor_cost: input.defaultSubcontractorCost || 0,
      is_subcontracted: input.isSubcontracted || false,
      notes: input.notes || input.description || '',
      rate_source_name: input.rateSourceName || null,
      rate_source_date: input.rateSourceDate || null,
      rate_source_notes: input.rateSourceNotes || null,
      user_id: user.id,
      organization_id: profile.organization_id,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating item template:', error)
    throw new Error(error.message || 'Failed to create item template')
  }

  return {
    id: data.id,
    name: data.name,
    category: data.category,
    defaultUnit: data.default_unit,
    defaultMaterialRate: data.default_material_rate,
    defaultLaborRate: data.default_labor_rate,
    defaultSubcontractorRate: data.default_subcontractor_rate,
    defaultSubcontractorCost: data.default_subcontractor_cost,
    isSubcontracted: data.is_subcontracted,
    notes: data.notes || '',
    description: data.notes || '',
    rateSourceName: data.rate_source_name ?? null,
    rateSourceDate: data.rate_source_date ?? null,
    rateSourceNotes: data.rate_source_notes ?? null,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  }
}

export async function updateItemTemplateInDB(id: string, updates: any): Promise<any | null> {
  if (!isOnlineMode()) return null

  const updateData: any = {}
  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.category !== undefined) updateData.category = updates.category
  if (updates.defaultUnit !== undefined) updateData.default_unit = updates.defaultUnit
  if (updates.defaultMaterialRate !== undefined) updateData.default_material_rate = updates.defaultMaterialRate
  if (updates.defaultLaborRate !== undefined) updateData.default_labor_rate = updates.defaultLaborRate
  if (updates.defaultSubcontractorRate !== undefined) updateData.default_subcontractor_rate = updates.defaultSubcontractorRate
  if (updates.defaultSubcontractorCost !== undefined) updateData.default_subcontractor_cost = updates.defaultSubcontractorCost
  if (updates.isSubcontracted !== undefined) updateData.is_subcontracted = updates.isSubcontracted
  if (updates.notes !== undefined) updateData.notes = updates.notes
  if (updates.description !== undefined) updateData.notes = updates.description
  if (updates.rateSourceName !== undefined) updateData.rate_source_name = updates.rateSourceName
  if (updates.rateSourceDate !== undefined) updateData.rate_source_date = updates.rateSourceDate
  if (updates.rateSourceNotes !== undefined) updateData.rate_source_notes = updates.rateSourceNotes

  const { data, error } = await supabase
    .from('item_templates')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating item template:', error)
    return null
  }

  return {
    id: data.id,
    name: data.name,
    category: data.category,
    defaultUnit: data.default_unit,
    defaultMaterialRate: data.default_material_rate,
    defaultLaborRate: data.default_labor_rate,
    defaultSubcontractorRate: data.default_subcontractor_rate,
    defaultSubcontractorCost: data.default_subcontractor_cost,
    isSubcontracted: data.is_subcontracted,
    notes: data.notes || '',
    description: data.notes || '',
    rateSourceName: data.rate_source_name ?? null,
    rateSourceDate: data.rate_source_date ?? null,
    rateSourceNotes: data.rate_source_notes ?? null,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  }
}

export async function deleteItemTemplateFromDB(id: string): Promise<boolean> {
  if (!isOnlineMode()) return false

  const { error } = await supabase
    .from('item_templates')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting item template:', error)
    return false
  }

  return true
}

// ============================================================================
// TRADE CATEGORIES (DB-backed; system + custom per org)
// ============================================================================

export async function fetchTradeCategoriesInDB(organizationId: string): Promise<{
  id: string
  key: string
  label: string
  icon: string
  sort_order: number
  is_system: boolean
  created_at: string
  updated_at: string
}[]> {
  if (!isOnlineMode()) return []
  const { data, error } = await supabase
    .from('trade_categories')
    .select('id, key, label, icon, sort_order, is_system, created_at, updated_at')
    .or(`organization_id.eq.system,organization_id.eq.${organizationId}`)
    .order('sort_order', { ascending: true })
  if (error) {
    console.error('Error fetching trade categories:', error)
    return []
  }
  return (data ?? []).map((row: any) => ({
    id: row.id,
    key: row.key,
    label: row.label,
    icon: row.icon ?? '📦',
    sort_order: row.sort_order ?? 0,
    is_system: row.is_system ?? false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }))
}

export async function createTradeCategoryInDB(
  organizationId: string,
  input: { key: string; label: string; icon?: string; sortOrder?: number }
): Promise<{ id: string; key: string; label: string; icon: string; sortOrder: number; isSystem: boolean } | null> {
  if (!isOnlineMode()) return null
  const { data, error } = await supabase
    .from('trade_categories')
    .insert({
      organization_id: organizationId,
      key: input.key.trim(),
      label: input.label.trim(),
      icon: input.icon?.trim() ?? '📦',
      sort_order: input.sortOrder ?? 999,
      is_system: false,
    })
    .select('id, key, label, icon, sort_order, is_system')
    .single()
  if (error) {
    console.error('Error creating trade category:', error)
    throw new Error(error.code === '23505' ? 'KEY_EXISTS' : error.message || 'Failed to create category')
  }
  return {
    id: data.id,
    key: data.key,
    label: data.label,
    icon: data.icon ?? '📦',
    sortOrder: data.sort_order ?? 0,
    isSystem: data.is_system ?? false,
  }
}

export async function updateTradeCategoryInDB(
  id: string,
  updates: { label?: string; icon?: string; sortOrder?: number }
): Promise<boolean> {
  if (!isOnlineMode()) return false
  const payload: any = {}
  if (updates.label !== undefined) payload.label = updates.label.trim()
  if (updates.icon !== undefined) payload.icon = updates.icon.trim()
  if (updates.sortOrder !== undefined) payload.sort_order = updates.sortOrder
  if (Object.keys(payload).length === 0) return true
  const { error } = await supabase.from('trade_categories').update(payload).eq('id', id)
  if (error) {
    console.error('Error updating trade category:', error)
    return false
  }
  return true
}

export async function deleteTradeCategoryFromDB(id: string): Promise<boolean> {
  if (!isOnlineMode()) return false
  const { error } = await supabase.from('trade_categories').delete().eq('id', id)
  if (error) {
    console.error('Error deleting trade category:', error)
    return false
  }
  return true
}

// ============================================================================
// PURCHASE ORDERS (PO)
// ============================================================================

export interface CreatePOLineInput {
  description: string
  quantity: number
  unit: string
  unitPrice: number
  amount: number
  sourceTradeId?: string | null
  sourceSubItemId?: string | null
}

export async function createPOInDB(
  projectId: string,
  subcontractorId: string,
  lines: CreatePOLineInput[]
): Promise<{ id: string } | null> {
  if (!isOnlineMode()) return null

  const { data: header, error: headerError } = await supabase
    .from('po_headers')
    .insert({
      project_id: projectId,
      subcontractor_id: subcontractorId,
      status: 'draft',
    })
    .select('id')
    .single()

  if (headerError || !header?.id) {
    console.error('Error creating PO header:', headerError)
    return null
  }

  if (lines.length === 0) return { id: header.id }

  const lineRows = lines.map((line, i) => ({
    po_id: header.id,
    sort_order: i,
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    unit_price: line.unitPrice,
    amount: line.amount,
    source_trade_id: line.sourceTradeId || null,
    source_sub_item_id: line.sourceSubItemId || null,
  }))

  const { error: linesError } = await supabase.from('po_lines').insert(lineRows)
  if (linesError) {
    console.error('Error creating PO lines:', linesError)
    await supabase.from('po_headers').delete().eq('id', header.id)
    return null
  }

  return { id: header.id }
}

export async function getPOsForProjectInDB(projectId: string): Promise<any[]> {
  if (!isOnlineMode()) return []

  const { data: headers, error: headersError } = await supabase
    .from('po_headers')
    .select(`
      id,
      project_id,
      subcontractor_id,
      po_number,
      status,
      issued_at,
      created_at,
      updated_at,
      subcontractors ( id, name )
    `)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (headersError || !headers?.length) return []

  const withLines = await Promise.all(
    headers.map(async (h: any) => {
      const { data: lineRows } = await supabase
        .from('po_lines')
        .select('*')
        .eq('po_id', h.id)
        .order('sort_order', { ascending: true })
      const lines = (lineRows || []).map((r: any) => ({
        id: r.id,
        poId: r.po_id,
        sortOrder: r.sort_order,
        description: r.description,
        quantity: r.quantity,
        unit: r.unit,
        unitPrice: r.unit_price,
        amount: r.amount,
        sourceTradeId: r.source_trade_id,
        sourceSubItemId: r.source_sub_item_id,
      }))
      return {
        id: h.id,
        projectId: h.project_id,
        subcontractorId: h.subcontractor_id,
        subcontractorName: h.subcontractors?.name ?? null,
        poNumber: h.po_number,
        status: h.status,
        issuedAt: h.issued_at ? new Date(h.issued_at) : null,
        createdAt: new Date(h.created_at),
        updatedAt: new Date(h.updated_at),
        lines,
      }
    })
  )
  return withLines
}

export async function issuePOInDB(
  poId: string,
  poNumber: string,
  issuedAt: Date
): Promise<boolean> {
  if (!isOnlineMode()) return false

  const { error } = await supabase
    .from('po_headers')
    .update({
      po_number: poNumber.trim(),
      status: 'issued',
      issued_at: issuedAt.toISOString(),
    })
    .eq('id', poId)

  if (error) {
    console.error('Error issuing PO:', error)
    return false
  }
  return true
}

// ============================================================================
// QUOTE DOCUMENT UPLOAD
// ============================================================================

/**
 * Upload a quote PDF document to Supabase Storage
 * Files are organized by organization/project/filename
 */
export async function uploadQuotePDF(
  file: File,
  projectId: string,
  tradeId: string
): Promise<string | null> {
  if (!isOnlineMode()) {
    console.warn('Cannot upload files in offline mode')
    return null
  }

  try {
    // Get current user and their organization
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('User not authenticated')
      return null
    }

    // Fetch user profile to get organization_id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('Error fetching user profile:', profileError)
      return null
    }

    // Create a unique filename with timestamp
    const timestamp = Date.now()
    const fileExt = file.name.split('.').pop()
    const fileName = `${tradeId}-${timestamp}.${fileExt}`
    const filePath = `${profile.organization_id}/${projectId}/${fileName}`

    // Upload to storage (vendor quote documents go to quote-documents bucket)
    const { data, error } = await supabase.storage
      .from('quote-documents')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      console.error('Error uploading quote document:', error)
      return null
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('quote-documents')
      .getPublicUrl(filePath)

    return publicUrl
  } catch (error) {
    console.error('Error in uploadQuotePDF:', error)
    return null
  }
}

/**
 * Delete a quote PDF document from Supabase Storage
 */
export async function deleteQuotePDF(fileUrl: string): Promise<boolean> {
  if (!isOnlineMode()) return false

  try {
    // Extract the file path from the URL
    const urlParts = fileUrl.split('/quote-documents/')
    if (urlParts.length < 2) {
      console.error('Invalid file URL')
      return false
    }

    const filePath = urlParts[1]

    const { error } = await supabase.storage
      .from('quote-documents')
      .remove([filePath])

    if (error) {
      console.error('Error deleting quote document:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in deleteQuotePDF:', error)
    return false
  }
}

/**
 * Get a signed URL for viewing a quote PDF document
 * Useful for private documents that require authentication
 */
export async function getQuotePDFSignedUrl(fileUrl: string, expiresIn: number = 3600): Promise<string | null> {
  if (!isOnlineMode()) return null

  try {
    // Extract the file path from the URL
    const urlParts = fileUrl.split('/quote-documents/')
    if (urlParts.length < 2) {
      console.error('Invalid file URL')
      return null
    }

    const filePath = urlParts[1]

    const { data, error } = await supabase.storage
      .from('quote-documents')
      .createSignedUrl(filePath, expiresIn)

    if (error) {
      console.error('Error creating signed URL:', error)
      return null
    }

    return data.signedUrl
  } catch (error) {
    console.error('Error in getQuotePDFSignedUrl:', error)
    return null
  }
}

// ============================================================================
// PROFORMA INPUTS OPERATIONS
// ============================================================================

interface ProFormaInputsRow {
  id: string
  project_id: string
  user_id: string
  contract_value: number
  start_date: string
  projection_months: number
  construction_completion_date: string | null
  total_project_square_footage: number | null
  monthly_overhead: number
  overhead_method: 'proportional' | 'flat' | 'none'
  payment_milestones: any
  include_rental_income: boolean
  rental_units: any
  include_operating_expenses: boolean
  operating_expenses: any
  include_debt_service: boolean
  debt_service: any
  created_at: string
  updated_at: string
}

/**
 * Save proforma inputs to database
 */
export async function saveProFormaInputs(
  projectId: string,
  inputs: {
    contractValue: number
    paymentMilestones: any[]
    monthlyOverhead: number
    overheadMethod: 'proportional' | 'flat' | 'none'
    projectionMonths: 6 | 12 | 24 | 36 | 60
    startDate: string
    totalProjectSquareFootage?: number
    includeRentalIncome: boolean
    rentalUnits: any[]
    includeOperatingExpenses: boolean
    operatingExpenses: any
    includeDebtService: boolean
    debtService: any
    constructionCompletionDate?: string
  }
): Promise<boolean> {
  if (!isOnlineMode()) return false

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('User not authenticated')
      return false
    }

    // Serialize dates in payment milestones
    const serializedMilestones = inputs.paymentMilestones.map(m => ({
      ...m,
      date: m.date instanceof Date ? m.date.toISOString() : m.date,
    }))

    // Serialize dates in rental units
    const serializedRentalUnits = inputs.rentalUnits.map(u => ({
      ...u,
      occupancyStartDate: u.occupancyStartDate instanceof Date 
        ? u.occupancyStartDate.toISOString() 
        : u.occupancyStartDate,
    }))

    // Serialize debt service start date
    const serializedDebtService = {
      ...inputs.debtService,
      startDate: inputs.debtService.startDate instanceof Date
        ? inputs.debtService.startDate.toISOString()
        : inputs.debtService.startDate,
    }

    // Get project to get organization_id
    const { data: projectData } = await supabase
      .from('projects')
      .select('organization_id')
      .eq('id', projectId)
      .single()

    const organizationId = projectData?.organization_id || 'default-org'

    const rowData = {
      project_id: projectId,
      user_id: user.id,
      organization_id: organizationId,
      contract_value: inputs.contractValue,
      start_date: inputs.startDate,
      projection_months: inputs.projectionMonths,
      construction_completion_date: inputs.constructionCompletionDate || null,
      total_project_square_footage: inputs.totalProjectSquareFootage || null,
      monthly_overhead: inputs.monthlyOverhead,
      overhead_method: inputs.overheadMethod,
      payment_milestones: serializedMilestones,
      include_rental_income: inputs.includeRentalIncome,
      rental_units: serializedRentalUnits,
      include_operating_expenses: inputs.includeOperatingExpenses,
      operating_expenses: inputs.operatingExpenses,
      include_debt_service: inputs.includeDebtService,
      debt_service: serializedDebtService,
    }

    // Try to update first, then insert if not found
    const { data: existing } = await supabase
      .from('proforma_inputs')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single()

    if (existing) {
      const { error } = await supabase
        .from('proforma_inputs')
        .update(rowData)
        .eq('id', existing.id)

      if (error) {
        console.error('Error updating proforma inputs:', error)
        return false
      }
    } else {
      const { error } = await supabase
        .from('proforma_inputs')
        .insert(rowData)

      if (error) {
        console.error('Error creating proforma inputs:', error)
        return false
      }
    }

    return true
  } catch (error) {
    console.error('Error in saveProFormaInputs:', error)
    return false
  }
}

/**
 * Load proforma inputs from database
 * Gets the most recent proforma input for the project from any user in the organization
 */
export async function loadProFormaInputs(projectId: string): Promise<any | null> {
  if (!isOnlineMode()) return null

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('User not authenticated')
      return null
    }

    // Get the most recent proforma input for this project from any user in the organization
    // This allows users to see each other's proforma inputs
    const { data, error } = await supabase
      .from('proforma_inputs')
      .select('*')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      if (error.code === 'PGRST116') {
        // No row found - this is okay
        return null
      }
      console.error('Error loading proforma inputs:', error)
      return null
    }

    if (!data) return null

    // Deserialize dates
    const paymentMilestones = (data.payment_milestones || []).map((m: any) => ({
      ...m,
      date: new Date(m.date),
    }))

    const rentalUnits = (data.rental_units || []).map((u: any) => ({
      ...u,
      occupancyStartDate: u.occupancyStartDate ? new Date(u.occupancyStartDate) : undefined,
    }))

    const debtService = {
      ...data.debt_service,
      startDate: new Date(data.debt_service.startDate),
    }

    return {
      contractValue: data.contract_value,
      paymentMilestones,
      monthlyOverhead: data.monthly_overhead,
      overheadMethod: data.overhead_method,
      projectionMonths: data.projection_months,
      startDate: data.start_date,
      totalProjectSquareFootage: data.total_project_square_footage || undefined,
      includeRentalIncome: data.include_rental_income,
      rentalUnits,
      includeOperatingExpenses: data.include_operating_expenses,
      operatingExpenses: data.operating_expenses,
      includeDebtService: data.include_debt_service,
      debtService,
      constructionCompletionDate: data.construction_completion_date || undefined,
    }
  } catch (error) {
    console.error('Error in loadProFormaInputs:', error)
    return null
  }
}

// ============================================================================
// PROJECT DOCUMENTS OPERATIONS
// ============================================================================

/**
 * Upload a project document to Supabase Storage
 * Files are organized by organization/project/filename
 */
export async function uploadProjectDocument(
  file: File,
  projectId: string,
  documentType: DocumentType,
  description?: string,
  category?: string,
  tags?: string[]
): Promise<ProjectDocument | null> {
  if (!isOnlineMode()) {
    console.warn('Cannot upload files in offline mode')
    return null
  }

  try {
    // Get current user and their organization
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('User not authenticated:', authError)
      return null
    }

    // Fetch user profile to get organization_id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('Error fetching user profile:', profileError)
      return null
    }

    if (!profile.organization_id) {
      console.error('User profile missing organization_id')
      return null
    }

    // Create a unique filename with timestamp
    const timestamp = Date.now()
    const fileExt = file.name.split('.').pop()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const fileName = `${timestamp}-${sanitizedName}`
    const filePath = `${profile.organization_id}/${projectId}/${fileName}`

    // Try to list buckets for debugging (but don't fail if this doesn't work due to RLS)
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets()
    if (bucketError) {
      console.warn('Could not list buckets (may be RLS restriction):', bucketError)
    } else {
      console.log('Available buckets:', buckets?.map(b => b.id))
      const bucketExists = buckets?.some(b => b.id === 'project-documents')
      if (!bucketExists) {
        console.warn('Bucket "project-documents" not found in list. Available buckets:', buckets?.map(b => b.id))
        console.warn('Attempting upload anyway - bucket may exist but not be visible due to RLS')
      }
    }

    // Try upload with primary bucket name
    let bucketName = 'project-documents'
    let { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    // If that fails with "Bucket not found", try alternative bucket name (with underscore)
    if (uploadError && uploadError.message?.includes('Bucket not found')) {
      console.warn(`Bucket "${bucketName}" not found, trying "project_documents" (with underscore)`)
      bucketName = 'project_documents'
      const retryResult = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })
      uploadData = retryResult.data
      uploadError = retryResult.error
    }

    if (uploadError) {
      console.error('Error uploading document:', uploadError)
      console.error('Bucket name tried:', bucketName)
      console.error('File path:', filePath)
      console.error('Organization ID:', profile.organization_id)
      console.error('Project ID:', projectId)
      console.error('File name:', file.name)
      console.error('File size:', file.size)
      console.error('File type:', file.type)
      
      // Provide user-friendly error message
      if (uploadError.message?.includes('Bucket not found')) {
        console.error('SOLUTION: Please verify the bucket name in Supabase Dashboard. It should be "project-documents" (with hyphen) or "project_documents" (with underscore).')
      } else if (uploadError.message?.includes('row-level security')) {
        console.error('SOLUTION: Check the storage bucket RLS policies. The INSERT policy should allow users to upload files in their organization folder.')
      }
      
      return null
    }

    // Generate signed URL for private bucket (valid for 1 year)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(filePath, 31536000) // 1 year

    if (signedUrlError) {
      console.error('Error creating signed URL:', signedUrlError)
      // Try to delete uploaded file
      try {
        await supabase.storage.from(bucketName).remove([filePath])
      } catch (storageError) {
        console.error('Error deleting uploaded file:', storageError)
      }
      return null
    }

    const signedUrl = signedUrlData?.signedUrl || null
    if (!signedUrl) {
      console.error('Failed to generate signed URL')
      // Try to delete uploaded file
      try {
        await supabase.storage.from(bucketName).remove([filePath])
      } catch (storageError) {
        console.error('Error deleting uploaded file:', storageError)
      }
      return null
    }

    // Create document record in database
    // Try with file_path first (if migration has been applied)
    let insertData: any = {
      project_id: projectId,
      organization_id: profile.organization_id,
      name: file.name,
      type: documentType,
      file_url: signedUrl, // Store signed URL instead of public URL
      file_path: filePath, // Store file path for regenerating signed URLs
      file_size: file.size,
      mime_type: file.type,
      uploaded_by: user.id,
      description: description || null,
      category: category || null,
      tags: tags || null,
    }

    let { data: docData, error: docError } = await supabase
      .from('project_documents')
      .insert(insertData)
      .select()
      .single()

    // If file_path column doesn't exist yet (migration not applied), retry without it
    if (docError && docError.message?.includes("file_path") && docError.message?.includes("schema cache")) {
      console.warn('file_path column not found, inserting without it. Please run migration 025_add_file_path_to_project_documents.sql')
      // Remove file_path from insert data
      delete insertData.file_path
      const retryResult = await supabase
        .from('project_documents')
        .insert(insertData)
        .select()
        .single()
      docData = retryResult.data
      docError = retryResult.error
    }

    if (docError || !docData) {
      console.error('Error creating document record:', docError)
      // Try to delete the uploaded file if database insert failed
      await supabase.storage.from(bucketName).remove([filePath])
      return null
    }

    // Transform to ProjectDocument
    return {
      id: docData.id,
      projectId: docData.project_id,
      name: docData.name,
      type: docData.type as DocumentType,
      fileUrl: docData.file_url,
      fileSize: docData.file_size,
      mimeType: docData.mime_type,
      category: docData.category || undefined,
      tags: docData.tags || undefined,
      uploadedBy: docData.uploaded_by,
      uploadedAt: new Date(docData.uploaded_at),
      description: docData.description || undefined,
      version: docData.version || undefined,
      replacesDocumentId: docData.replaces_document_id || undefined,
    }
  } catch (error) {
    console.error('Error in uploadProjectDocument:', error)
    return null
  }
}

/**
 * Fetch all documents for a project
 */
export async function fetchProjectDocuments(projectId: string): Promise<ProjectDocument[]> {
  if (!isOnlineMode()) return []

  try {
    // Select without file_path for now (migration 025_add_file_path_to_project_documents.sql not applied yet)
    // Once migration is applied, we can add file_path to the select list for better signed URL regeneration
    const { data, error } = await supabase
      .from('project_documents')
      .select('id, project_id, name, type, file_url, file_size, mime_type, category, tags, uploaded_by, uploaded_at, description, version, replaces_document_id')
      .eq('project_id', projectId)
      .order('uploaded_at', { ascending: false })

    if (error) {
      console.error('Error fetching project documents:', error)
      return []
    }

    if (!data) {
      return []
    }

    // Generate signed URLs for documents if needed
    const documentsWithUrls = await Promise.all(
      data.map(async (row: any) => {
        let fileUrl = row.file_url
        let filePath = row.file_path
        
        // If we have file_path, always regenerate signed URL (URLs expire after 1 year)
        if (filePath) {
          // Try primary bucket name first
          let bucketName = 'project-documents'
          let { data: signedUrlData, error: signedUrlError } = await supabase.storage
            .from(bucketName)
            .createSignedUrl(filePath, 31536000) // 1 year
          
          // If that fails, try alternative bucket name
          if (signedUrlError && signedUrlError.message?.includes('Bucket not found')) {
            bucketName = 'project_documents'
            const retryResult = await supabase.storage
              .from(bucketName)
              .createSignedUrl(filePath, 31536000)
            signedUrlData = retryResult.data
            signedUrlError = retryResult.error
          }
          
          if (signedUrlData?.signedUrl) {
            fileUrl = signedUrlData.signedUrl
          } else if (signedUrlError) {
            console.warn('Could not generate signed URL for document:', row.id, signedUrlError)
            // If signed URL generation fails, try to use existing URL as fallback
            if (!fileUrl || !fileUrl.startsWith('http')) {
              console.error('No valid URL available for document:', row.id)
            }
          }
        } else if (fileUrl) {
          // For legacy documents without file_path, try to extract path from URL and regenerate
          // Check if URL is a signed URL (contains query params) or public URL
          const urlParts = fileUrl.split('/project-documents/')
          if (urlParts.length >= 2) {
            const extractedPath = urlParts[1].split('?')[0] // Remove query params if present
            // Try to regenerate signed URL
            let bucketName = 'project-documents'
            const { data: signedUrlData } = await supabase.storage
              .from(bucketName)
              .createSignedUrl(extractedPath, 31536000)
            
            if (signedUrlData?.signedUrl) {
              fileUrl = signedUrlData.signedUrl
              // Optionally update the database with file_path for future use
              // (commented out to avoid unnecessary writes)
              // await supabase.from('project_documents').update({ file_path: extractedPath }).eq('id', row.id)
            }
          } else {
            // Try alternative bucket name
            const altUrlParts = fileUrl.split('/project_documents/')
            if (altUrlParts.length >= 2) {
              const extractedPath = altUrlParts[1].split('?')[0]
              const { data: signedUrlData } = await supabase.storage
                .from('project_documents')
                .createSignedUrl(extractedPath, 31536000)
              
              if (signedUrlData?.signedUrl) {
                fileUrl = signedUrlData.signedUrl
              }
            }
          }
        }
        
        return {
          id: row.id,
          projectId: row.project_id,
          name: row.name,
          type: row.type as DocumentType,
          fileUrl: fileUrl,
          fileSize: row.file_size,
          mimeType: row.mime_type,
          category: row.category || undefined,
          tags: row.tags || undefined,
          uploadedBy: row.uploaded_by,
          uploadedAt: new Date(row.uploaded_at),
          description: row.description || undefined,
          version: row.version || undefined,
          replacesDocumentId: row.replaces_document_id || undefined,
        }
      })
    )
    
    return documentsWithUrls
  } catch (error) {
    console.error('Error in fetchProjectDocuments:', error)
    return []
  }
}

/**
 * Delete a project document
 */
export async function deleteProjectDocument(documentId: string): Promise<boolean> {
  if (!isOnlineMode()) return false

  try {
    // First, get the document to find the file path
    // Select without file_path for now (migration 025_add_file_path_to_project_documents.sql not applied yet)
    const { data: doc, error: fetchError } = await supabase
      .from('project_documents')
      .select('file_url')
      .eq('id', documentId)
      .single()

    if (fetchError || !doc) {
      console.error('Error fetching document:', fetchError)
      return false
    }

    // Extract file path from URL (file_path column not available yet)
    let filePath: string | null = null
    let bucketName = 'project-documents'

    // Try to extract from URL
    if (doc.file_url) {
      // Try primary bucket name first
      const urlParts = doc.file_url.split('/project-documents/')
      if (urlParts && urlParts.length >= 2) {
        // Remove query parameters if present (signed URLs have query params)
        filePath = urlParts[1].split('?')[0]
      } else {
        // Try alternative bucket name
        const altUrlParts = doc.file_url.split('/project_documents/')
        if (altUrlParts && altUrlParts.length >= 2) {
          filePath = altUrlParts[1].split('?')[0]
          bucketName = 'project_documents'
        }
      }
    }

    if (!filePath) {
      console.warn('Could not determine file path for document:', documentId, 'URL:', doc.file_url)
      // Continue to delete database record even if we can't delete from storage
    } else {
      // Delete from storage
      let { error: storageError } = await supabase.storage
        .from(bucketName)
        .remove([filePath])

      // If that fails, try alternative bucket name
      if (storageError && storageError.message?.includes('Bucket not found')) {
        bucketName = bucketName === 'project-documents' ? 'project_documents' : 'project-documents'
        const retryResult = await supabase.storage
          .from(bucketName)
          .remove([filePath])
        storageError = retryResult.error
      }

      if (storageError) {
        console.error('Error deleting file from storage:', storageError)
        // Continue to delete the database record even if storage delete fails
      }
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from('project_documents')
      .delete()
      .eq('id', documentId)

    if (dbError) {
      console.error('Error deleting document record:', dbError)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in deleteProjectDocument:', error)
    return false
  }
}

/**
 * Update document metadata
 */
export async function updateProjectDocument(
  documentId: string,
  updates: {
    name?: string
    type?: DocumentType
    description?: string
    category?: string
    tags?: string[]
  }
): Promise<ProjectDocument | null> {
  if (!isOnlineMode()) return null

  try {
    const updateData: any = {}
    if (updates.name !== undefined) updateData.name = updates.name
    if (updates.type !== undefined) updateData.type = updates.type
    if (updates.description !== undefined) updateData.description = updates.description
    if (updates.category !== undefined) updateData.category = updates.category
    if (updates.tags !== undefined) updateData.tags = updates.tags
    updateData.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('project_documents')
      .update(updateData)
      .eq('id', documentId)
      .select()
      .single()

    if (error || !data) {
      console.error('Error updating document:', error)
      return null
    }

    return {
      id: data.id,
      projectId: data.project_id,
      name: data.name,
      type: data.type as DocumentType,
      fileUrl: data.file_url,
      fileSize: data.file_size,
      mimeType: data.mime_type,
      category: data.category || undefined,
      tags: data.tags || undefined,
      uploadedBy: data.uploaded_by,
      uploadedAt: new Date(data.uploaded_at),
      description: data.description || undefined,
      version: data.version || undefined,
      replacesDocumentId: data.replaces_document_id || undefined,
    }
  } catch (error) {
    console.error('Error in updateProjectDocument:', error)
    return null
  }
}

// ============================================================================
// DEAL DOCUMENTS OPERATIONS
// ============================================================================

/**
 * Upload a deal document to Supabase Storage
 * Files are organized by organization/deal/filename
 */
export async function uploadDealDocument(
  file: File,
  dealId: string,
  documentType: DealDocumentType,
  description?: string,
  category?: string,
  tags?: string[]
): Promise<DealDocument | null> {
  if (!isOnlineMode()) {
    console.warn('Cannot upload files in offline mode')
    return null
  }

  try {
    // Get current user and their organization
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('User not authenticated:', authError)
      return null
    }

    // Fetch user profile to get organization_id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('Error fetching user profile:', profileError)
      return null
    }

    if (!profile.organization_id) {
      console.error('User profile missing organization_id')
      return null
    }

    // Create a unique filename with timestamp
    const timestamp = Date.now()
    const fileExt = file.name.split('.').pop()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const fileName = `${timestamp}-${sanitizedName}`
    const filePath = `${profile.organization_id}/${dealId}/${fileName}`

    // Upload to storage (deal documents go to deal-documents bucket)
    let bucketName = 'deal-documents'
    let { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    // If that fails with "Bucket not found", try alternative bucket name (with underscore)
    if (uploadError && uploadError.message?.includes('Bucket not found')) {
      console.warn(`Bucket "${bucketName}" not found, trying "deal_documents" (with underscore)`)
      bucketName = 'deal_documents'
      const retryResult = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })
      uploadData = retryResult.data
      uploadError = retryResult.error
    }

    if (uploadError) {
      console.error('Error uploading deal document:', uploadError)
      return null
    }

    if (!uploadData) {
      console.error('Upload succeeded but no data returned')
      return null
    }

    // Generate signed URL (private bucket requires signed URLs)
    let { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(filePath, 31536000) // 1 year

    // If that fails, try alternative bucket name
    if (signedUrlError && signedUrlError.message?.includes('Bucket not found')) {
      bucketName = bucketName === 'deal-documents' ? 'deal_documents' : 'deal-documents'
      const retryResult = await supabase.storage
        .from(bucketName)
        .createSignedUrl(filePath, 31536000)
      signedUrlData = retryResult.data
      signedUrlError = retryResult.error
    }

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error('Error generating signed URL:', signedUrlError)
      // Try to delete the uploaded file if signed URL generation failed
      await supabase.storage.from(bucketName).remove([filePath])
      return null
    }

    const signedUrl = signedUrlData.signedUrl

    // Create document record in database
    let insertData: any = {
      deal_id: dealId,
      organization_id: profile.organization_id,
      name: file.name,
      type: documentType,
      file_url: signedUrl, // Store signed URL
      file_path: filePath, // Store file path for regenerating signed URLs
      file_size: file.size,
      mime_type: file.type,
      uploaded_by: user.id,
      description: description || null,
      category: category || null,
      tags: tags || null,
    }

    let { data: docData, error: docError } = await supabase
      .from('deal_documents')
      .insert(insertData)
      .select()
      .single()

    // If file_path column doesn't exist yet (migration not applied), retry without it
    if (docError && docError.message?.includes("file_path") && docError.message?.includes("schema cache")) {
      console.warn('file_path column not found, inserting without it. Please run migration 030_create_deal_documents.sql')
      delete insertData.file_path
      const retryResult = await supabase
        .from('deal_documents')
        .insert(insertData)
        .select()
        .single()
      docData = retryResult.data
      docError = retryResult.error
    }

    if (docError || !docData) {
      console.error('Error creating document record:', docError)
      // Try to delete the uploaded file if database insert failed
      await supabase.storage.from(bucketName).remove([filePath])
      return null
    }

    // Transform to DealDocument
    return {
      id: docData.id,
      dealId: docData.deal_id,
      name: docData.name,
      type: docData.type as DealDocumentType,
      fileUrl: docData.file_url,
      filePath: docData.file_path || undefined,
      fileSize: docData.file_size,
      mimeType: docData.mime_type,
      category: docData.category || undefined,
      tags: docData.tags || undefined,
      uploadedBy: docData.uploaded_by,
      uploadedAt: new Date(docData.uploaded_at),
      description: docData.description || undefined,
      version: docData.version || undefined,
      replacesDocumentId: docData.replaces_document_id || undefined,
    }
  } catch (error) {
    console.error('Error in uploadDealDocument:', error)
    return null
  }
}

/**
 * Fetch all documents for a deal
 */
export async function fetchDealDocuments(dealId: string): Promise<DealDocument[]> {
  if (!isOnlineMode()) return []

  try {
    const { data, error } = await supabase
      .from('deal_documents')
      .select('id, deal_id, name, type, file_url, file_path, file_size, mime_type, category, tags, uploaded_by, uploaded_at, description, version, replaces_document_id')
      .eq('deal_id', dealId)
      .order('uploaded_at', { ascending: false })

    if (error) {
      console.error('Error fetching deal documents:', error)
      return []
    }

    if (!data) {
      return []
    }

    // Generate signed URLs for documents if needed
    const documentsWithUrls = await Promise.all(
      data.map(async (row: any) => {
        let fileUrl = row.file_url
        let filePath = row.file_path
        
        // If we have file_path, always regenerate signed URL (URLs expire after 1 year)
        if (filePath) {
          // Try primary bucket name first
          let bucketName = 'deal-documents'
          let { data: signedUrlData, error: signedUrlError } = await supabase.storage
            .from(bucketName)
            .createSignedUrl(filePath, 31536000) // 1 year
          
          // If that fails, try alternative bucket name
          if (signedUrlError && signedUrlError.message?.includes('Bucket not found')) {
            bucketName = 'deal_documents'
            const retryResult = await supabase.storage
              .from(bucketName)
              .createSignedUrl(filePath, 31536000)
            signedUrlData = retryResult.data
            signedUrlError = retryResult.error
          }
          
          if (signedUrlData?.signedUrl) {
            fileUrl = signedUrlData.signedUrl
          } else if (signedUrlError) {
            console.warn('Could not generate signed URL for document:', row.id, signedUrlError)
            // If signed URL generation fails, try to use existing URL as fallback
            if (!fileUrl || !fileUrl.startsWith('http')) {
              console.error('No valid URL available for document:', row.id)
            }
          }
        } else if (fileUrl) {
          // For legacy documents without file_path, try to extract path from URL and regenerate
          const urlParts = fileUrl.split('/deal-documents/')
          if (urlParts && urlParts.length >= 2) {
            const extractedPath = urlParts[1].split('?')[0]
            const { data: signedUrlData } = await supabase.storage
              .from('deal-documents')
              .createSignedUrl(extractedPath, 31536000)
            if (signedUrlData?.signedUrl) {
              fileUrl = signedUrlData.signedUrl
            }
          }
        }
        
        return {
          id: row.id,
          dealId: row.deal_id,
          name: row.name,
          type: row.type as DealDocumentType,
          fileUrl: fileUrl,
          filePath: row.file_path || undefined,
          fileSize: row.file_size,
          mimeType: row.mime_type,
          category: row.category || undefined,
          tags: row.tags || undefined,
          uploadedBy: row.uploaded_by,
          uploadedAt: new Date(row.uploaded_at),
          description: row.description || undefined,
          version: row.version || undefined,
          replacesDocumentId: row.replaces_document_id || undefined,
        }
      })
    )
    
    return documentsWithUrls
  } catch (error) {
    console.error('Error in fetchDealDocuments:', error)
    return []
  }
}

/**
 * Delete a deal document
 */
export async function deleteDealDocument(documentId: string): Promise<boolean> {
  if (!isOnlineMode()) return false

  try {
    // First, get the document to find the file path
    const { data: doc, error: fetchError } = await supabase
      .from('deal_documents')
      .select('file_url, file_path')
      .eq('id', documentId)
      .single()

    if (fetchError || !doc) {
      console.error('Error fetching document:', fetchError)
      return false
    }

    // Use file_path if available, otherwise extract from URL
    let filePath: string | null = doc.file_path || null
    let bucketName = 'deal-documents'

    if (!filePath && doc.file_url) {
      // Try to extract from URL
      const urlParts = doc.file_url.split('/deal-documents/')
      if (urlParts && urlParts.length >= 2) {
        filePath = urlParts[1].split('?')[0]
      } else {
        // Try alternative bucket name
        const altUrlParts = doc.file_url.split('/deal_documents/')
        if (altUrlParts && altUrlParts.length >= 2) {
          filePath = altUrlParts[1].split('?')[0]
          bucketName = 'deal_documents'
        }
      }
    }

    if (!filePath) {
      console.warn('Could not determine file path for document:', documentId, 'URL:', doc.file_url)
      // Continue to delete database record even if we can't delete from storage
    } else {
      // Delete from storage
      let { error: storageError } = await supabase.storage
        .from(bucketName)
        .remove([filePath])

      // If that fails, try alternative bucket name
      if (storageError && storageError.message?.includes('Bucket not found')) {
        bucketName = bucketName === 'deal-documents' ? 'deal_documents' : 'deal-documents'
        const retryResult = await supabase.storage
          .from(bucketName)
          .remove([filePath])
        storageError = retryResult.error
      }

      if (storageError) {
        console.error('Error deleting file from storage:', storageError)
        // Continue to delete the database record even if storage delete fails
      }
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from('deal_documents')
      .delete()
      .eq('id', documentId)

    if (dbError) {
      console.error('Error deleting document record:', dbError)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in deleteDealDocument:', error)
    return false
  }
}

/**
 * Update deal document metadata
 */
export async function updateDealDocument(
  documentId: string,
  updates: {
    type?: DealDocumentType
    description?: string
    category?: string
    tags?: string[]
  }
): Promise<DealDocument | null> {
  if (!isOnlineMode()) return null

  try {
    const updateData: any = {}
    if (updates.type !== undefined) updateData.type = updates.type
    if (updates.description !== undefined) updateData.description = updates.description
    if (updates.category !== undefined) updateData.category = updates.category
    if (updates.tags !== undefined) updateData.tags = updates.tags
    updateData.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('deal_documents')
      .update(updateData)
      .eq('id', documentId)
      .select()
      .single()

    if (error || !data) {
      console.error('Error updating document:', error)
      return null
    }

    return {
      id: data.id,
      dealId: data.deal_id,
      name: data.name,
      type: data.type as DealDocumentType,
      fileUrl: data.file_url,
      filePath: data.file_path || undefined,
      fileSize: data.file_size,
      mimeType: data.mime_type,
      category: data.category || undefined,
      tags: data.tags || undefined,
      uploadedBy: data.uploaded_by,
      uploadedAt: new Date(data.uploaded_at),
      description: data.description || undefined,
      version: data.version || undefined,
      replacesDocumentId: data.replaces_document_id || undefined,
    }
  } catch (error) {
    console.error('Error in updateDealDocument:', error)
    return null
  }
}

// ============================================================================
// HELPER: Check if online mode is active
// ============================================================================

export { isOnlineMode }


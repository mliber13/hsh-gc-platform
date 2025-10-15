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
  LaborEntry,
  MaterialEntry,
  SubcontractorEntry,
  PlanEstimateTemplate,
  CreatePlanEstimateTemplateInput,
} from '@/types'

// ============================================================================
// PROJECT OPERATIONS
// ============================================================================

// Helper to transform database row to Project
function transformProject(row: any): Project {
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
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    estimate: row.estimate || { id: '', projectId: row.id, version: 1 },
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

  return data.map(transformProject)
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

  return transformProject(data)
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
      organization_id: profile.organization_id,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating project:', error)
    return null
  }

  return transformProject(data)
}

export async function updateProjectInDB(projectId: string, updates: UpdateProjectInput): Promise<Project | null> {
  if (!isOnlineMode()) return null

  const { data, error } = await supabase
    .from('projects')
    .update({
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
    })
    .eq('id', projectId)
    .select()
    .single()

  if (error) {
    console.error('Error updating project:', error)
    return null
  }

  return data as Project
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

// ============================================================================
// ESTIMATE OPERATIONS
// ============================================================================

export async function fetchEstimateByProjectId(projectId: string): Promise<any | null> {
  if (!isOnlineMode()) return null

  const { data, error } = await supabase
    .from('estimates')
    .select('*')
    .eq('project_id', projectId)
    .single()

  if (error) {
    console.error('Error fetching estimate:', error)
    return null
  }

  return data
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
      organization_id: profile.organization_id,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating estimate:', error)
    return null
  }

  return data
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

  return data as Trade[]
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

  const { data, error } = await supabase
    .from('trades')
    .insert({
      estimate_id: estimateId,
      category: input.category,
      name: input.name,
      quantity: input.quantity || 1,
      unit: input.unit || 'ea',
      unit_cost: totalCost,
      total_cost: totalCost,
      markup_percent: input.markupPercent || 0,
      notes: input.notes || '',
      organization_id: profile.organization_id,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating trade:', error)
    return null
  }

  return data as Trade
}

export async function updateTradeInDB(tradeId: string, updates: Partial<TradeInput>): Promise<Trade | null> {
  if (!isOnlineMode()) return null

  const totalCost = (updates.laborCost || 0) + (updates.materialCost || 0) + (updates.subcontractorCost || 0)

  const updateData: any = {}
  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.quantity !== undefined) updateData.quantity = updates.quantity
  if (updates.unit !== undefined) updateData.unit = updates.unit
  if (updates.markupPercent !== undefined) updateData.markup_percent = updates.markupPercent
  if (updates.notes !== undefined) updateData.notes = updates.notes
  if (totalCost > 0) {
    updateData.unit_cost = totalCost
    updateData.total_cost = totalCost
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

  return data as Trade
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

// ============================================================================
// ACTUAL ENTRIES OPERATIONS
// ============================================================================

export async function fetchLaborEntries(projectId: string): Promise<LaborEntry[]> {
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
    ...entry,
    date: new Date(entry.date),
  })) as LaborEntry[]
}

export async function createLaborEntryInDB(projectId: string, actualsId: string, entry: Omit<LaborEntry, 'id'>): Promise<LaborEntry | null> {
  if (!isOnlineMode()) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('labor_entries')
    .insert({
      user_id: user.id,
      project_id: projectId,
      actuals_id: actualsId,
      category: (entry as any).category,
      trade_id: (entry as any).tradeId,
      description: entry.description,
      date: entry.date.toISOString(),
      hours: (entry as any).hours,
      hourly_rate: (entry as any).hourlyRate,
      amount: (entry as any).amount,
      worker_name: (entry as any).workerName,
      notes: (entry as any).notes,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating labor entry:', error)
    return null
  }

  return {
    ...data,
    date: new Date(data.date),
  } as LaborEntry
}

// Similar functions for Material and Subcontractor entries...
// (I'll add these next to keep the file organized)

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
    ...template,
    createdAt: new Date(template.created_at),
    updatedAt: new Date(template.updated_at),
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

  const { data, error } = await supabase
    .from('estimate_templates')
    .insert({
      user_id: user.id,
      name: input.name,
      description: input.description,
      trades: templateTrades,
      default_markup_percent: input.defaultMarkupPercent || 11.1,
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
    ...data,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  } as PlanEstimateTemplate
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
    type: item.type,
    unit: item.unit,
    costPerUnit: item.cost_per_unit,
    description: item.description || '',
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
      type: input.type,
      unit: input.unit,
      cost_per_unit: input.costPerUnit,
      description: input.description || '',
      organization_id: profile.organization_id,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating item template:', error)
    return null
  }

  return {
    id: data.id,
    name: data.name,
    category: data.category,
    type: data.type,
    unit: data.unit,
    costPerUnit: data.cost_per_unit,
    description: data.description || '',
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  }
}

export async function updateItemTemplateInDB(id: string, updates: any): Promise<any | null> {
  if (!isOnlineMode()) return null

  const updateData: any = {}
  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.category !== undefined) updateData.category = updates.category
  if (updates.type !== undefined) updateData.type = updates.type
  if (updates.unit !== undefined) updateData.unit = updates.unit
  if (updates.costPerUnit !== undefined) updateData.cost_per_unit = updates.costPerUnit
  if (updates.description !== undefined) updateData.description = updates.description

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
    type: data.type,
    unit: data.unit,
    costPerUnit: data.cost_per_unit,
    description: data.description || '',
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
// HELPER: Check if online mode is active
// ============================================================================

export { isOnlineMode }


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

  return data as Project[]
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

  return data as Project
}

export async function createProjectInDB(input: CreateProjectInput): Promise<Project | null> {
  if (!isOnlineMode()) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: user.id,
      name: input.name,
      type: input.type,
      status: 'planning',
      address: input.address,
      city: input.city,
      state: input.state,
      zip_code: input.zipCode,
      client: input.client,
      start_date: input.startDate?.toISOString(),
      end_date: input.endDate?.toISOString(),
      metadata: input.metadata || {},
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating project:', error)
    return null
  }

  return data as Project
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

  const { data, error } = await supabase
    .from('estimates')
    .insert({
      user_id: user.id,
      project_id: projectId,
      totals: {},
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

  const { data, error } = await supabase
    .from('trades')
    .insert({
      user_id: user.id,
      estimate_id: estimateId,
      category: input.category,
      name: input.name,
      description: input.description,
      quantity: input.quantity,
      unit: input.unit,
      labor_cost: input.laborCost || 0,
      labor_rate: input.laborRate || 0,
      labor_hours: input.laborHours || 0,
      material_cost: input.materialCost || 0,
      material_rate: input.materialRate || 0,
      subcontractor_cost: input.subcontractorCost || 0,
      total_cost: (input.laborCost || 0) + (input.materialCost || 0) + (input.subcontractorCost || 0),
      is_subcontracted: input.isSubcontracted,
      waste_factor: input.wasteFactor,
      markup_percent: input.markupPercent,
      notes: input.notes,
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

  const { data, error } = await supabase
    .from('trades')
    .update({
      name: updates.name,
      description: updates.description,
      quantity: updates.quantity,
      unit: updates.unit,
      labor_cost: updates.laborCost,
      labor_rate: updates.laborRate,
      labor_hours: updates.laborHours,
      material_cost: updates.materialCost,
      material_rate: updates.materialRate,
      subcontractor_cost: updates.subcontractorCost,
      total_cost: (updates.laborCost || 0) + (updates.materialCost || 0) + (updates.subcontractorCost || 0),
      is_subcontracted: updates.isSubcontracted,
      waste_factor: updates.wasteFactor,
      markup_percent: updates.markupPercent,
      notes: updates.notes,
    })
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
// HELPER: Check if online mode is active
// ============================================================================

export { isOnlineMode }


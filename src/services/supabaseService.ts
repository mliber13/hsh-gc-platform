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

  return {
    id: estimate.id,
    projectId: estimate.project_id,
    version: 1,
    trades: [],
    subtotal: 0,
    overhead: 0,
    profit: 0,
    contingency: 0,
    totalEstimate: 0,
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

  return data.map(transformTrade)
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
      total_cost: totalCost,
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

  const totalCost = (updates.laborCost || 0) + (updates.materialCost || 0) + (updates.subcontractorCost || 0)

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
  if (updates.isSubcontracted !== undefined) updateData.is_subcontracted = updates.isSubcontracted
  if (updates.wasteFactor !== undefined) updateData.waste_factor = updates.wasteFactor
  if (updates.markupPercent !== undefined) updateData.markup_percent = updates.markupPercent
  if (updates.notes !== undefined) updateData.notes = updates.notes
  if ((updates as any).estimateStatus !== undefined) updateData.estimate_status = (updates as any).estimateStatus
  if ((updates as any).quoteVendor !== undefined) updateData.quote_vendor = (updates as any).quoteVendor
  if ((updates as any).quoteDate !== undefined) updateData.quote_date = (updates as any).quoteDate
  if ((updates as any).quoteReference !== undefined) updateData.quote_reference = (updates as any).quoteReference
  if ((updates as any).quoteFileUrl !== undefined) updateData.quote_file_url = (updates as any).quoteFileUrl
  updateData.total_cost = totalCost

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
      trade_id: entry.tradeId,
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
      description: entry.materialName,
      date: entry.date.toISOString(),
      quantity: entry.quantity || 0,
      unit_cost: entry.unitCost || 0,
      amount: entry.totalCost,
      vendor: entry.vendor || '',
      invoice_number: entry.invoiceNumber || '',
      notes: entry.notes || '',
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
      trade_id: entry.tradeId,
      description: entry.scopeOfWork,
      date: new Date().toISOString(),
      amount: entry.totalPaid,
      subcontractor_name: entry.subcontractorName,
      invoice_number: entry.invoiceNumber || '',
      notes: entry.notes || '',
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
    defaultUnit: item.default_unit,
    defaultMaterialRate: item.default_material_rate,
    defaultLaborRate: item.default_labor_rate,
    defaultSubcontractorCost: item.default_subcontractor_cost,
    isSubcontracted: item.is_subcontracted,
    notes: item.notes || '',
    description: item.notes || '',
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
      default_unit: input.defaultUnit,
      default_material_rate: input.defaultMaterialRate || 0,
      default_labor_rate: input.defaultLaborRate || 0,
      default_subcontractor_cost: input.defaultSubcontractorCost || 0,
      is_subcontracted: input.isSubcontracted || false,
      notes: input.notes || input.description || '',
      user_id: user.id,
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
    defaultUnit: data.default_unit,
    defaultMaterialRate: data.default_material_rate,
    defaultLaborRate: data.default_labor_rate,
    defaultSubcontractorCost: data.default_subcontractor_cost,
    isSubcontracted: data.is_subcontracted,
    notes: data.notes || '',
    description: data.notes || '',
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
  if (updates.defaultSubcontractorCost !== undefined) updateData.default_subcontractor_cost = updates.defaultSubcontractorCost
  if (updates.isSubcontracted !== undefined) updateData.is_subcontracted = updates.isSubcontracted
  if (updates.notes !== undefined) updateData.notes = updates.notes
  if (updates.description !== undefined) updateData.notes = updates.description

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
    defaultSubcontractorCost: data.default_subcontractor_cost,
    isSubcontracted: data.is_subcontracted,
    notes: data.notes || '',
    description: data.notes || '',
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
      .from('user_profiles')
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

    // Upload to storage
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
// HELPER: Check if online mode is active
// ============================================================================

export { isOnlineMode }


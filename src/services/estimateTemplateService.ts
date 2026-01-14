// ============================================================================
// Estimate Template Service
// ============================================================================
//
// Business logic for managing estimate templates
//

import { v4 as uuidv4 } from 'uuid'
import { 
  PlanEstimateTemplate,
  CreatePlanEstimateTemplateInput,
  UpdatePlanEstimateTemplateInput
} from '@/types/estimateTemplate'
import { Trade } from '@/types'
import { isOnlineMode } from '@/lib/supabase'
import * as supabaseService from './supabaseService'

// Storage key
const STORAGE_KEY = 'hsh_gc_estimate_templates'

// Helper to parse dates
const dateReviver = (key: string, value: any) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    return new Date(value)
  }
  return value
}

// ============================================================================
// Template CRUD Operations
// ============================================================================

export async function getAllEstimateTemplates(): Promise<PlanEstimateTemplate[]> {
  if (isOnlineMode()) {
    // Fetch from Supabase in online mode
    return await supabaseService.fetchEstimateTemplates()
  } else {
    // Use localStorage in offline mode
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (!data) return []
      return JSON.parse(data, dateReviver) as PlanEstimateTemplate[]
    } catch (error) {
      console.error('Error reading estimate templates:', error)
      return []
    }
  }
}

export async function getEstimateTemplateById(templateId: string): Promise<PlanEstimateTemplate | null> {
  const templates = await getAllEstimateTemplates()
  return templates.find(t => t.id === templateId) || null
}

export async function createEstimateTemplate(input: CreatePlanEstimateTemplateInput): Promise<PlanEstimateTemplate> {
  if (isOnlineMode()) {
    // Use Supabase service for online mode
    const template = await supabaseService.createEstimateTemplateInDB(input)
    if (!template) throw new Error('Failed to create template in database')
    return template
  } else {
    // Use localStorage for offline mode
    const templates = await getAllEstimateTemplates()
    
    // Convert trades to template format (remove IDs)
    const templateTrades = input.trades.map(trade => {
      const { id, estimateId, ...tradeData } = trade
      return tradeData
    })
    
    const newTemplate: PlanEstimateTemplate = {
      id: uuidv4(),
      name: input.name,
      description: input.description,
      trades: templateTrades,
      defaultMarkupPercent: input.defaultMarkupPercent || 11.1,
      defaultContingencyPercent: input.defaultContingencyPercent || 10,
      createdAt: new Date(),
      updatedAt: new Date(),
      usageCount: 0,
      linkedPlanIds: [],
    }
    
    templates.push(newTemplate)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
    
    return newTemplate
  }
}

export async function updateEstimateTemplate(
  templateId: string,
  updates: UpdatePlanEstimateTemplateInput
): Promise<PlanEstimateTemplate | null> {
  if (isOnlineMode()) {
    // TODO: Implement Supabase update for online mode
    console.warn('Update template in online mode not yet implemented')
    return null
  } else {
    const templates = await getAllEstimateTemplates()
    const index = templates.findIndex(t => t.id === templateId)
    
    if (index === -1) return null
    
    templates[index] = {
      ...templates[index],
      ...updates,
      updatedAt: new Date(),
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
    return templates[index]
  }
}

export async function deleteEstimateTemplate(templateId: string): Promise<boolean> {
  if (isOnlineMode()) {
    // TODO: Implement Supabase delete for online mode
    console.warn('Delete template in online mode not yet implemented')
    return false
  } else {
    const templates = await getAllEstimateTemplates()
    const filtered = templates.filter(t => t.id !== templateId)
    
    if (filtered.length === templates.length) return false
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
    return true
  }
}

// ============================================================================
// Template Usage
// ============================================================================

export async function incrementTemplateUsage(templateId: string): Promise<void> {
  const template = await getEstimateTemplateById(templateId)
  if (!template) return
  
  await updateEstimateTemplate(templateId, {
    ...template,
    usageCount: template.usageCount + 1,
  })
}

export async function linkTemplateToPlan(templateId: string, planId: string): Promise<void> {
  const template = await getEstimateTemplateById(templateId)
  if (!template) return
  
  if (!template.linkedPlanIds.includes(planId)) {
    await updateEstimateTemplate(templateId, {
      ...template,
      linkedPlanIds: [...template.linkedPlanIds, planId],
    })
  }
}

export async function unlinkTemplateFromPlan(templateId: string, planId: string): Promise<void> {
  const template = await getEstimateTemplateById(templateId)
  if (!template) return
  
  await updateEstimateTemplate(templateId, {
    ...template,
    linkedPlanIds: template.linkedPlanIds.filter(id => id !== planId),
  })
}

// ============================================================================
// Template Application
// ============================================================================

/**
 * Apply a template's trades to an estimate
 * This creates new Trade objects from the template
 */
export async function applyTemplateToEstimate(
  templateId: string,
  estimateId: string
): Promise<Trade[]> {
  const template = await getEstimateTemplateById(templateId)
  if (!template) return []
  
  // Create new trades from template
  const newTrades: Trade[] = template.trades.map(templateTrade => ({
    ...templateTrade,
    id: uuidv4(),
    estimateId,
    markupPercent: templateTrade.markupPercent || template.defaultMarkupPercent || 11.1,
  }))
  
  // Increment usage count
  await incrementTemplateUsage(templateId)
  
  return newTrades
}


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

export function getAllEstimateTemplates(): PlanEstimateTemplate[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    return JSON.parse(data, dateReviver) as PlanEstimateTemplate[]
  } catch (error) {
    console.error('Error reading estimate templates:', error)
    return []
  }
}

export function getEstimateTemplateById(templateId: string): PlanEstimateTemplate | null {
  const templates = getAllEstimateTemplates()
  return templates.find(t => t.id === templateId) || null
}

export function createEstimateTemplate(input: CreatePlanEstimateTemplateInput): PlanEstimateTemplate {
  const templates = getAllEstimateTemplates()
  
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

export function updateEstimateTemplate(
  templateId: string,
  updates: UpdatePlanEstimateTemplateInput
): PlanEstimateTemplate | null {
  const templates = getAllEstimateTemplates()
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

export function deleteEstimateTemplate(templateId: string): boolean {
  const templates = getAllEstimateTemplates()
  const filtered = templates.filter(t => t.id !== templateId)
  
  if (filtered.length === templates.length) return false
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  return true
}

// ============================================================================
// Template Usage
// ============================================================================

export function incrementTemplateUsage(templateId: string): void {
  const template = getEstimateTemplateById(templateId)
  if (!template) return
  
  updateEstimateTemplate(templateId, {
    ...template,
    usageCount: template.usageCount + 1,
  })
}

export function linkTemplateToPlan(templateId: string, planId: string): void {
  const template = getEstimateTemplateById(templateId)
  if (!template) return
  
  if (!template.linkedPlanIds.includes(planId)) {
    updateEstimateTemplate(templateId, {
      ...template,
      linkedPlanIds: [...template.linkedPlanIds, planId],
    })
  }
}

export function unlinkTemplateFromPlan(templateId: string, planId: string): void {
  const template = getEstimateTemplateById(templateId)
  if (!template) return
  
  updateEstimateTemplate(templateId, {
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
export function applyTemplateToEstimate(
  templateId: string,
  estimateId: string
): Trade[] {
  const template = getEstimateTemplateById(templateId)
  if (!template) return []
  
  // Create new trades from template
  const newTrades: Trade[] = template.trades.map(templateTrade => ({
    ...templateTrade,
    id: uuidv4(),
    estimateId,
    markupPercent: templateTrade.markupPercent || template.defaultMarkupPercent || 11.1,
  }))
  
  // Increment usage count
  incrementTemplateUsage(templateId)
  
  return newTrades
}


// ============================================================================
// Plan Service
// ============================================================================
//
// Business logic for managing construction plans and templates
//

import { v4 as uuidv4 } from 'uuid'
import { 
  Plan, 
  PlanDocument, 
  PlanOption,
  CreatePlanInput,
  UpdatePlanInput,
  PlanOptionInput,
  PlanDocumentInput
} from '@/types/plan'

// Storage keys
const STORAGE_KEYS = {
  PLANS: 'hsh-plans',
  PLAN_DOCUMENTS: 'hsh-plan-documents',
}

// Helper to parse dates
const dateReviver = (key: string, value: any) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    return new Date(value)
  }
  return value
}

// ============================================================================
// Plan CRUD Operations
// ============================================================================

export function getAllPlans(): Plan[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.PLANS)
    if (!data) return []
    return JSON.parse(data, dateReviver) as Plan[]
  } catch (error) {
    console.error('Error reading plans:', error)
    return []
  }
}

export function getPlanById(planId: string): Plan | null {
  const plans = getAllPlans()
  return plans.find(p => p.id === planId) || null
}

export function getPlanByPlanId(planId: string): Plan | null {
  const plans = getAllPlans()
  return plans.find(p => p.planId === planId) || null
}

export function createPlan(input: CreatePlanInput): Plan {
  const plans = getAllPlans()
  
  const newPlan: Plan = {
    id: uuidv4(),
    planId: input.planId,
    name: input.name,
    description: input.description,
    squareFootage: input.squareFootage,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    stories: input.stories,
    garageSpaces: input.garageSpaces,
    documents: [],
    options: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    notes: input.notes,
  }
  
  plans.push(newPlan)
  localStorage.setItem(STORAGE_KEYS.PLANS, JSON.stringify(plans))
  
  return newPlan
}

export function updatePlan(planId: string, updates: UpdatePlanInput): Plan | null {
  const plans = getAllPlans()
  const index = plans.findIndex(p => p.id === planId)
  
  if (index === -1) return null
  
  plans[index] = {
    ...plans[index],
    ...updates,
    updatedAt: new Date(),
  }
  
  localStorage.setItem(STORAGE_KEYS.PLANS, JSON.stringify(plans))
  return plans[index]
}

export function deletePlan(planId: string): boolean {
  const plans = getAllPlans()
  const filtered = plans.filter(p => p.id !== planId)
  
  if (filtered.length === plans.length) return false
  
  localStorage.setItem(STORAGE_KEYS.PLANS, JSON.stringify(filtered))
  return true
}

// ============================================================================
// Plan Option Operations
// ============================================================================

export function addPlanOption(planId: string, input: PlanOptionInput): PlanOption | null {
  const plan = getPlanById(planId)
  if (!plan) return null
  
  const newOption: PlanOption = {
    id: uuidv4(),
    name: input.name,
    description: input.description,
    documents: [],
    additionalCost: input.additionalCost,
  }
  
  plan.options.push(newOption)
  updatePlan(planId, { ...plan })
  
  return newOption
}

export function updatePlanOption(
  planId: string, 
  optionId: string, 
  updates: Partial<PlanOptionInput>
): PlanOption | null {
  const plan = getPlanById(planId)
  if (!plan) return null
  
  const optionIndex = plan.options.findIndex(o => o.id === optionId)
  if (optionIndex === -1) return null
  
  plan.options[optionIndex] = {
    ...plan.options[optionIndex],
    ...updates,
  }
  
  updatePlan(planId, { ...plan })
  return plan.options[optionIndex]
}

export function deletePlanOption(planId: string, optionId: string): boolean {
  const plan = getPlanById(planId)
  if (!plan) return false
  
  const filtered = plan.options.filter(o => o.id !== optionId)
  if (filtered.length === plan.options.length) return false
  
  plan.options = filtered
  updatePlan(planId, { ...plan })
  return true
}

// ============================================================================
// Document Operations
// ============================================================================

export function addPlanDocument(input: PlanDocumentInput): Promise<PlanDocument> {
  return new Promise<PlanDocument>((resolve, reject) => {
    const plan = getPlanById(input.planId)
    if (!plan) {
      reject(new Error('Plan not found'))
      return
    }
    
    // Store document reference (not the actual file to avoid quota issues)
    const newDocument: PlanDocument = {
      id: uuidv4(),
      planId: input.planId,
      name: input.name,
      type: input.type,
      fileUrl: input.fileUrl || '', // External link provided by user
      fileName: input.fileName || input.file?.name || 'document',
      fileSize: input.file?.size,
      fileType: input.file?.type,
      uploadedAt: new Date(),
      notes: input.notes,
      storageType: input.fileUrl ? 'external-link' : 'local-reference',
    }
    
    // Add to plan or option
    if (input.optionId) {
      const option = plan.options.find(o => o.id === input.optionId)
      if (option) {
        option.documents.push(newDocument)
      }
    } else {
      plan.documents.push(newDocument)
    }
    
    // Save the updated plan back to storage
    const plans = getAllPlans()
    const index = plans.findIndex(p => p.id === plan.id)
    if (index !== -1) {
      plans[index] = plan
      try {
        localStorage.setItem(STORAGE_KEYS.PLANS, JSON.stringify(plans))
        resolve(newDocument)
      } catch (error) {
        reject(new Error('Storage quota exceeded'))
      }
    } else {
      reject(new Error('Failed to save plan'))
    }
  })
}

export function deletePlanDocument(planId: string, documentId: string, optionId?: string): boolean {
  const plan = getPlanById(planId)
  if (!plan) return false
  
  if (optionId) {
    const option = plan.options.find(o => o.id === optionId)
    if (!option) return false
    
    const filtered = option.documents.filter(d => d.id !== documentId)
    if (filtered.length === option.documents.length) return false
    
    option.documents = filtered
  } else {
    const filtered = plan.documents.filter(d => d.id !== documentId)
    if (filtered.length === plan.documents.length) return false
    
    plan.documents = filtered
  }
  
  updatePlan(planId, { ...plan })
  return true
}

// ============================================================================
// Helper Functions
// ============================================================================

export function getActivePlans(): Plan[] {
  return getAllPlans().filter(p => p.isActive)
}

export function searchPlans(searchTerm: string): Plan[] {
  const plans = getAllPlans()
  const term = searchTerm.toLowerCase()
  
  return plans.filter(p => 
    p.name.toLowerCase().includes(term) ||
    p.planId.toLowerCase().includes(term) ||
    p.description?.toLowerCase().includes(term)
  )
}

export function getPlanStats() {
  const plans = getAllPlans()
  
  return {
    total: plans.length,
    active: plans.filter(p => p.isActive).length,
    inactive: plans.filter(p => !p.isActive).length,
    withDocuments: plans.filter(p => p.documents.length > 0).length,
    withOptions: plans.filter(p => p.options.length > 0).length,
  }
}


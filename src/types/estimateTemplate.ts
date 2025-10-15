// ============================================================================
// Estimate Template Types
// ============================================================================
//
// Types for saving and reusing estimate templates
//

import { Trade } from './project'

export interface PlanEstimateTemplate {
  id: string
  name: string
  description?: string
  
  // Template data
  trades: Omit<Trade, 'id' | 'estimateId' | 'createdAt' | 'updatedAt'>[]
  
  // Default percentages
  defaultMarkupPercent?: number
  defaultContingencyPercent?: number
  
  // Metadata
  createdAt: Date
  updatedAt: Date
  usageCount: number // Track how many times this template has been used
  linkedPlanIds: string[] // Plans that use this template
}

export interface CreatePlanEstimateTemplateInput {
  name: string
  description?: string
  trades: Trade[] // Will be converted to template format
  defaultMarkupPercent?: number
  defaultContingencyPercent?: number
}

export interface UpdatePlanEstimateTemplateInput {
  name?: string
  description?: string
  trades?: Omit<Trade, 'id' | 'estimateId'>[]
  defaultMarkupPercent?: number
  defaultContingencyPercent?: number
  usageCount?: number
  linkedPlanIds?: string[]
}


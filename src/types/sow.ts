// ============================================================================
// Statement of Work (SOW) Types
// ============================================================================

import { TradeCategory } from './constants'

// ----------------------------------------------------------------------------
// SOW Task
// ----------------------------------------------------------------------------

export interface SOWTask {
  id: string
  description: string
  order: number
}

// ----------------------------------------------------------------------------
// SOW Material
// ----------------------------------------------------------------------------

export interface SOWMaterial {
  id: string
  description: string
  included: boolean // true = included, false = excluded
  order: number
}

// ----------------------------------------------------------------------------
// SOW Specification
// ----------------------------------------------------------------------------

export interface SOWSpecification {
  id: string
  label: string
  value: string
  order: number
}

// ----------------------------------------------------------------------------
// SOW Template
// ----------------------------------------------------------------------------

export interface SOWTemplate {
  id: string
  userId: string
  organizationId?: string
  
  // Template details
  name: string
  description?: string
  tradeCategory?: TradeCategory
  
  // SOW content
  tasks: SOWTask[]
  materialsIncluded: SOWMaterial[]
  materialsExcluded: SOWMaterial[]
  specifications: SOWSpecification[]
  
  // Usage tracking
  useCount: number
  
  // Metadata
  createdAt: Date
  updatedAt: Date
}

// ----------------------------------------------------------------------------
// Create SOW Template Input
// ----------------------------------------------------------------------------

export interface CreateSOWTemplateInput {
  name: string
  description?: string
  tradeCategory?: TradeCategory
  tasks?: SOWTask[]
  materialsIncluded?: SOWMaterial[]
  materialsExcluded?: SOWMaterial[]
  specifications?: SOWSpecification[]
}

// ----------------------------------------------------------------------------
// Update SOW Template Input
// ----------------------------------------------------------------------------

export interface UpdateSOWTemplateInput {
  name?: string
  description?: string
  tradeCategory?: TradeCategory
  tasks?: SOWTask[]
  materialsIncluded?: SOWMaterial[]
  materialsExcluded?: SOWMaterial[]
  specifications?: SOWSpecification[]
}

// ----------------------------------------------------------------------------
// Formatted SOW (for display/export)
// ----------------------------------------------------------------------------

export interface FormattedSOW {
  tasks: string[]
  materialsIncluded: string[]
  materialsExcluded: string[]
  specifications: Record<string, string>
}


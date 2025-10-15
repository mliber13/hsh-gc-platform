// ============================================================================
// Plan Types
// ============================================================================
//
// Types for managing construction plan templates
//

export interface PlanDocument {
  id: string
  planId: string
  name: string
  type: 'floor-plan' | 'elevation' | 'site-plan' | 'foundation' | 'electrical' | 'plumbing' | 'other'
  fileUrl: string // External link (Google Drive, Dropbox, etc.) or local file path
  fileName: string
  fileSize?: number
  fileType?: string // 'application/pdf', 'image/png', etc.
  uploadedAt: Date
  notes?: string
  storageType: 'external-link' | 'local-reference' // Track how file is stored
}

export interface PlanOption {
  id: string
  name: string
  description?: string
  documents: PlanDocument[]
  estimateTemplateId?: string
  additionalCost?: number
  additionalSquareFootage?: number // Living space added by this option
}

export interface Plan {
  id: string
  planId: string // User-facing ID like "1416CN", "Gunnison-29547"
  name: string // Display name like "Gunnison"
  description?: string
  squareFootage?: number
  bedrooms?: number
  bathrooms?: number
  stories?: number
  garageSpaces?: number
  
  // Base plan documents
  documents: PlanDocument[]
  
  // Optional variations
  options: PlanOption[]
  
  // Base estimate template
  estimateTemplateId?: string
  
  // Metadata
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  createdBy?: string
  notes?: string
}

export interface CreatePlanInput {
  planId: string
  name: string
  description?: string
  squareFootage?: number
  bedrooms?: number
  bathrooms?: number
  stories?: number
  garageSpaces?: number
  notes?: string
}

export interface UpdatePlanInput {
  name?: string
  description?: string
  squareFootage?: number
  bedrooms?: number
  bathrooms?: number
  stories?: number
  garageSpaces?: number
  isActive?: boolean
  notes?: string
  estimateTemplateId?: string
}

export interface PlanDocumentInput {
  planId: string
  optionId?: string // If this document belongs to an option
  name: string
  type: PlanDocument['type']
  file?: File
  fileUrl?: string // External link (Google Drive, Dropbox, etc.)
  fileName?: string
  notes?: string
}

export interface PlanOptionInput {
  name: string
  description?: string
  additionalCost?: number
  additionalSquareFootage?: number
}

export type PlanSortField = 'name' | 'planId' | 'createdAt' | 'updatedAt'
export type PlanFilterStatus = 'all' | 'active' | 'inactive'


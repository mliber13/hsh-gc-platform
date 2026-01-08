// ============================================================================
// Deal Pipeline Types
// ============================================================================

export type DealType = 
  | 'new-single-family'
  | 'mixed-residential'
  | 'multifamily'
  | 'residential'
  | 'commercial'
  | 'custom'

export type DealStatus = 
  | 'early-stage'
  | 'concept-pre-funding'
  | 'very-early'
  | 'pending-docs'
  | 'active-pipeline'
  | 'custom'

export interface DealContact {
  name?: string
  email?: string
  phone?: string
  company?: string
  address?: string
  notes?: string
}

export interface DealNote {
  id: string
  deal_id: string
  note_text: string
  created_by: string
  created_at: string
}

export interface Deal {
  id: string
  organization_id: string
  
  // Basic Info
  deal_name: string
  location: string
  unit_count?: number
  type: DealType
  custom_type?: string
  
  // Financial & Timeline
  projected_cost?: number
  estimated_duration_months?: number
  expected_start_date?: string
  
  // Status
  status: DealStatus
  custom_status?: string
  
  // Contact
  contact?: DealContact
  
  // Metadata
  created_by: string
  created_at: string
  updated_at: string
  
  // Conversion tracking
  converted_to_projects: boolean
  converted_at?: string
  
  // Related data (loaded separately)
  notes?: DealNote[]
}

export interface CreateDealInput {
  deal_name: string
  location: string
  unit_count?: number
  type: DealType
  custom_type?: string
  projected_cost?: number
  estimated_duration_months?: number
  expected_start_date?: string
  status?: DealStatus
  custom_status?: string
  contact?: DealContact
}

export interface UpdateDealInput extends Partial<CreateDealInput> {
  // Can update any field
}

export interface ConvertDealToProjectsInput {
  dealId: string
  projectCount: number // For multi-project deals
  namingPattern?: string // e.g., "{Deal Name} - Unit {#}", "{Deal Name} - Lot {#}"
  startDateOffset?: number // Days offset from expected_start_date for each project
}


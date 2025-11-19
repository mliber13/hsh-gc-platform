// ============================================================================
// Partner Directory Types (Subcontractors & Suppliers)
// ============================================================================

export interface PartnerBase {
  id: string
  organizationId: string
  name: string
  contactName?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  notes?: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Subcontractor extends PartnerBase {
  trade?: string | null
}

export interface Supplier extends PartnerBase {
  category?: string | null
}

export interface SubcontractorInput {
  name: string
  trade?: string | null
  contactName?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  notes?: string | null
  isActive?: boolean
}

export interface SupplierInput {
  name: string
  category?: string | null
  contactName?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  notes?: string | null
  isActive?: boolean
}

export type PartnerDirectoryEntity = Subcontractor | Supplier



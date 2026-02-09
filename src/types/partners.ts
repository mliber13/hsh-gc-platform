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

/** Developer (company) - same structure as Subcontractor/Supplier */
export interface Developer extends PartnerBase {
  type?: string | null
}

/** Municipality (e.g. City of Columbiana) - officials/inspectors as contacts */
export interface Municipality extends PartnerBase {
  /** Optional; name (e.g. "City of Columbiana") is usually sufficient */
  jurisdiction?: string | null
}

/** Lender (e.g. bank) - multiple contacts per entity */
export interface Lender extends PartnerBase {
  type?: string | null
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

export interface DeveloperInput {
  name: string
  type?: string | null
  contactName?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  notes?: string | null
  isActive?: boolean
}

export interface MunicipalityInput {
  name: string
  contactName?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  notes?: string | null
  isActive?: boolean
}

export interface LenderInput {
  name: string
  type?: string | null
  contactName?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  notes?: string | null
  isActive?: boolean
}

export type PartnerDirectoryEntity = Subcontractor | Supplier | Developer | Municipality | Lender



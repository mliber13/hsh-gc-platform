// ============================================================================
// Contact Directory - labeled contacts and entity-linked contacts
// ============================================================================

/** Standalone contact labels (person only, no company). Inspectors are under Municipalities. */
export type StandaloneContactLabel =
  | 'USER'  // App user – category set in directory (Employee, 1099, etc.)
  | 'EMPLOYEE'
  | 'INDEPENDENT_1099'
  | 'ARCHITECT'
  | 'ENGINEER'
  | 'TITLE_CLOSING'
  | 'INSURANCE'

/** Entity types that can have multiple contact persons */
export type ContactEntityType = 'SUBCONTRACTOR' | 'SUPPLIER' | 'DEVELOPER' | 'MUNICIPALITY' | 'LENDER'

/** All contact labels: standalone or implied by entity (for display) */
export type ContactLabel = StandaloneContactLabel | ContactEntityType

export interface Contact {
  id: string
  organizationId: string
  /** Label for standalone contacts; for entity-linked, derived from entity type */
  label: string
  name: string
  email: string | null
  phone: string | null
  role: string | null
  notes: string | null
  /** Set when this contact is an additional contact for a subcontractor */
  subcontractorId: string | null
  /** Set when this contact is an additional contact for a supplier */
  supplierId: string | null
  /** Set when this contact is an additional contact for a developer */
  developerId: string | null
  /** Set when this contact is an additional contact for a municipality (e.g. official, inspector) */
  municipalityId: string | null
  /** Set when this contact is an additional contact for a lender */
  lenderId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ContactInput {
  label: string
  name: string
  email?: string | null
  phone?: string | null
  role?: string | null
  notes?: string | null
  subcontractorId?: string | null
  supplierId?: string | null
  developerId?: string | null
  municipalityId?: string | null
  lenderId?: string | null
}

/** Labels shown in People tab only (Architect, Engineer, Title/Closing, Insurance are under Partners). */
export const STANDALONE_CONTACT_LABELS: { value: StandaloneContactLabel; label: string }[] = [
  { value: 'USER', label: 'User (set category)' },
  { value: 'EMPLOYEE', label: 'Employee' },
  { value: 'INDEPENDENT_1099', label: "1099" },
]

export type PartnerLabelTab = 'architects' | 'engineers' | 'title_closing' | 'insurance'

/** Partner tabs that are label-only (no company entity). Shown under Partners tab. */
export const PARTNER_LABEL_TABS: { tab: PartnerLabelTab; label: StandaloneContactLabel; title: string }[] = [
  { tab: 'architects', label: 'ARCHITECT', title: 'Architects' },
  { tab: 'engineers', label: 'ENGINEER', title: 'Engineers' },
  { tab: 'title_closing', label: 'TITLE_CLOSING', title: 'Title / Closing' },
  { tab: 'insurance', label: 'INSURANCE', title: 'Insurance' },
]

/** Role/label options when adding a contact under a Municipality (e.g. Inspector, City Manager). Use "Other" in UI to show custom role input. */
export const MUNICIPALITY_CONTACT_ROLES: { value: string; label: string }[] = [
  { value: 'Inspector', label: 'Inspector' },
  { value: 'Building Official', label: 'Building Official' },
  { value: 'City Manager', label: 'City Manager' },
  { value: 'Mayor', label: 'Mayor' },
  { value: 'Council Member', label: 'Council Member' },
  { value: 'Permit Coordinator', label: 'Permit Coordinator' },
  { value: 'Code Enforcement', label: 'Code Enforcement' },
  { value: 'Clerk', label: 'Clerk' },
]

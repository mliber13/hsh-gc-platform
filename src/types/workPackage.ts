// ============================================================================
// Work Package types (public.work_packages)
// ============================================================================

export interface WorkPackage {
  id: string
  projectId: string
  organizationId: string
  tradeId: string | null
  subItemId: string | null
  packageType: string
  status: string
  ownerTeam: string
  responsiblePartyType: string
  responsiblePartyId: string | null
  targetStart: string | null
  targetFinish: string | null
  forecastStart: string | null
  forecastFinish: string | null
  actualStart: string | null
  actualFinish: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateWorkPackageInput {
  packageType: string
  responsiblePartyType?: string
  tradeId?: string | null
  subItemId?: string | null
  targetStart?: string | null
  targetFinish?: string | null
  notes?: string | null
}

export interface UpdateWorkPackageInput {
  packageType?: string
  status?: string
  responsiblePartyType?: string
  tradeId?: string | null
  subItemId?: string | null
  targetStart?: string | null
  targetFinish?: string | null
  notes?: string | null
}

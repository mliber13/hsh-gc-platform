// ============================================================================
// Project Milestones (public.project_milestones) - GC <-> Drywall schedule bridge
// ============================================================================

export type MilestoneSourceApp = 'GC' | 'DRYWALL'

export type MilestoneStatus =
  | 'PLANNED'
  | 'FORECASTED'
  | 'IN_PROGRESS'
  | 'DONE'
  | 'BLOCKED'
  | 'CANCELLED'

export interface ProjectMilestone {
  id: string
  projectId: string
  organizationId: string
  createdBy: string | null
  sourceApp: MilestoneSourceApp
  milestoneKey: string
  milestoneName: string
  targetDate: string | null
  forecastDate: string | null
  actualDate: string | null
  status: MilestoneStatus
  notes: string | null
  metadata: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateMilestoneInput {
  milestoneKey: string
  milestoneName: string
  targetDate?: string | null
  forecastDate?: string | null
  actualDate?: string | null
  status?: MilestoneStatus
  notes?: string | null
}

export interface UpdateMilestoneInput {
  milestoneName?: string
  targetDate?: string | null
  forecastDate?: string | null
  actualDate?: string | null
  status?: MilestoneStatus
  notes?: string | null
}

import type { ScheduleItemTask } from '@/services/scheduleService'

export interface CrewInviteToken {
  id: string
  token: string
  linkedEmployeeId: string | null
  linkedContractorId: string | null
  invitedEmail: string | null
  createdAt: string
  expiresAt: string
  consumedAt: string | null
}

export type CrewLinkedPersonType = 'employee' | 'contractor'

export interface CrewProfileLink {
  userId: string
  personType: CrewLinkedPersonType
  personId: string
  personName: string
  email: string
  updatedAt: string
}

export type CrewAccountStatus = 'none' | 'invite_pending' | 'linked'

import type { CrewSpecialty } from '@/lib/drywall/crewSpecialty'
import type { FieldTakeoff } from '@/types/drywall'

export type { CrewSpecialty } from '@/lib/drywall/crewSpecialty'

export type CrewMeasureWorkflowStatus =
  import('@/lib/drywall/crewMeasureStatus').CrewMeasureWorkflowStatus

export interface CrewProjectListItem {
  /** Unique per assigned schedule item — a project can appear multiple times, once per task. */
  scheduleItemId: string
  scheduleItemName: string
  /** start_date (yyyy-MM-dd) of this assignment. */
  scheduleItemDate: string
  projectId: string
  projectName: string
  client: string
  address: string
  status: string
  /** Measurer workflow pill — only when this schedule item is a Measure phase. */
  measureWorkflowStatus?: CrewMeasureWorkflowStatus | null
}

export interface CrewProjectScheduleEntry {
  id: string
  name: string
  type: 'field' | 'office'
  startDate: string
  endDate: string
  status: string
  notes: string | null
  tasks: ScheduleItemTask[]
}

export type CrewLaborRateSource =
  | 'order_approved'
  | 'pending_order'
  | 'v3_override'
  | 'v2_legacy'
  | 'catalog_default'

export interface CrewMaterial {
  id: string
  /** Category name e.g. "Corner Bead", "Fasteners", "Joint Compound". */
  type: string
  subtype: string | null
  quantity: string
  unit: string
  /** Length for bead types (e.g. "10ft"). */
  length: string | null
  /** Thread type for screw fasteners (e.g. "Coarse"). */
  threadType: string | null
}

/** Field-measured board counts for hangers, grouped by area. */
export interface CrewBoardAreaGroup {
  area: string
  boards: Array<{
    id: string
    label: string
    quantity: number
  }>
}

export interface CrewStructuredScope {
  useCustom: boolean
  customText: string | null
  /** Hang/finish scope summary — e.g. "Hang and finish included." */
  drywallScopeLabel: string | null
  /** Optional component trades (grid, RC channel, metal stud, etc.). */
  addonLines: string[]
  hangCeilingThickness: string | null
  hangWallThickness: string | null
  hangExceptions: string | null
  ceilingFinish: string | null
  ceilingExceptions: string | null
  wallFinish: string | null
  wallExceptions: string | null
  additionalNotes: string | null
}

export interface CrewMeasurePageContext {
  projectId: string
  projectName: string
  specialty: CrewSpecialty
  workflowStatus: CrewMeasureWorkflowStatus
  /** Assigned schedule item whose name matches measure phase. */
  hasMeasureAssignment: boolean
  /** Normalized field takeoff from metadata.legacy.fieldTakeoff. */
  fieldTakeoff: FieldTakeoff
  projectAddress: string
  scopeOfWork: string
  structuredScope: CrewStructuredScope | null
}

export interface CrewProjectDetail {
  projectId: string
  projectName: string
  client: string
  address: string
  status: string
  scopeOfWork: string
  /** Structured scope — present when v3 quote has structured fields filled. */
  structuredScope: CrewStructuredScope | null
  totalSqft: number | null
  /** Total bead sticks on the job — operator's count typically excludes tearaway. */
  beadSticks: number | null
  /** Materials list filtered by user's specialty (hanger sees install hardware, finisher sees all). */
  materials: CrewMaterial[]
  /** Field board counts by area — hangers / both / operator preview only. */
  boardCountsByArea: CrewBoardAreaGroup[]
  /** Whether the Boards by area section should render (even if empty). */
  showBoardCounts: boolean
  /** Field photos uploaded during measurement — surface to crew for site context. */
  photos: { id: string; storagePath: string | null; url: string | null; label: string | null }[]
  specialty: CrewSpecialty
  laborRates: {
    hangerRate: number | null
    finisherRate: number | null
    prepCleanRate: number | null
    rateSource: CrewLaborRateSource
  }
  estimatedTotalPay: {
    hanger: number | null
    finisher: number | null
  }
  fieldNotes: {
    siteContact: string | null
    contactPhone: string | null
    meetingLocation: string | null
    accessNotes: string | null
    hazards: string | null
    /** Free-form notes the field measurer leaves for the crew. */
    notes: string | null
  }
  scheduleEntries: CrewProjectScheduleEntry[]
  intakeSource: 'quote' | 'po'
  /**
   * True when this person is marked "Show job info" on at least one of their
   * schedule assignments for this project. When false, crew UI hides sqft/pay/materials.
   */
  showJobInfo: boolean
  /** Measurer schedule assignment present — gates field takeoff / photo writes. */
  hasMeasureAssignment: boolean
  /** Field takeoff review workflow — set for measurers / operator preview. */
  measureWorkflowStatus: CrewMeasureWorkflowStatus | null
}

export interface CommsUnreadEntry {
  projectId: string
  projectName: string
  unreadCount: number
  lastEntryAt: string | null
}

export interface CommsUnreadSummary {
  byProject: CommsUnreadEntry[]
  totalUnread: number
}

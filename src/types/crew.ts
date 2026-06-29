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

export interface CrewProjectListItem {
  projectId: string
  projectName: string
  client: string
  address: string
  status: string
  nextScheduledDate: string | null
  scheduleEntryCount: number
}

export interface CrewProjectScheduleEntry {
  id: string
  name: string
  type: 'field' | 'office'
  startDate: string
  endDate: string
  status: string
  notes: string | null
}

export type CrewLaborRateSource =
  | 'order_approved'
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

export interface CrewStructuredScope {
  useCustom: boolean
  customText: string | null
  hangCeilingThickness: string | null
  hangWallThickness: string | null
  hangExceptions: string | null
  ceilingFinish: string | null
  ceilingExceptions: string | null
  wallFinish: string | null
  wallExceptions: string | null
  additionalNotes: string | null
}

import type { CrewSpecialty } from '@/lib/drywall/crewSpecialty'

export type { CrewSpecialty } from '@/lib/drywall/crewSpecialty'

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
  } | null
  scheduleEntries: CrewProjectScheduleEntry[]
  breakdowns: Array<{
    id: string
    description: string
    location: string | null
    sqft: number | null
    finishScope: string | null
  }>
  intakeSource: 'quote' | 'po'
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

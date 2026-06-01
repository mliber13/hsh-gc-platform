// ============================================================================
// HR types — org_team.payload shape (shared with Drywall app JSONB blob)
// ============================================================================

export type MemberStatus = 'active' | 'archived'
export type PayType = 'hourly' | 'salary' | 'piece'

export interface ToolRepayment {
  id?: string
  amount?: string | number
  totalAmount?: string | number
  amountPaid?: string | number
  weeklyAmount?: string | number
  date?: string
  note?: string
  description?: string
}

export interface TeamMemberBase {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  startDate?: string | null
  positionId?: string | null
  payType?: PayType | string | null
  hourlyRate?: number | string | null
  salaryAmount?: number | string | null
  pieceRate?: number | string | null
  ownersDraw?: number | string | null
  gasAllowance?: number | string | null
  bankedHours?: number | string | null
  status?: MemberStatus | string | null
  toolRepayments?: ToolRepayment[]
}

export interface Employee extends TeamMemberBase {}

export interface Contractor1099 extends TeamMemberBase {
  company?: string | null
}

export interface JobPosition {
  id: string
  name: string
}

export interface OrgTeamPayload {
  employees: Employee[]
  contractors1099: Contractor1099[]
  positions: JobPosition[]
}

export const EMPTY_ORG_TEAM_PAYLOAD: OrgTeamPayload = {
  employees: [],
  contractors1099: [],
  positions: [],
}

export type TimePersonType = 'w2' | '1099'
export type TimeEntrySourceApp = 'DRYWALL' | 'GC'

export interface TimeEntry {
  id: string
  organization_id: string
  project_id?: string | null
  project_name?: string | null
  person_type: TimePersonType
  person_id: string
  person_name?: string | null
  clock_in: string
  clock_out?: string | null
  source_app?: TimeEntrySourceApp | string | null
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export interface PunchState {
  linked: boolean
  hrPersonId?: string | null
  hrPersonType?: TimePersonType | null
  openEntry: TimeEntry | null
}

export interface TimeEntryEditDraft {
  project_id?: string | null
  project_name?: string | null
  person_id?: string
  person_type?: TimePersonType
  person_name?: string | null
  clock_in?: string
  clock_out?: string | null
}

export interface TimeEntriesRangeQuery {
  from: string
  to: string
  personId?: string
  projectId?: string
}

export interface PayrollTimeImportQuery {
  start: string
  end: string
}

export interface PayrollTimeImportRow {
  personId: string
  personType: TimePersonType
  personName: string
  projectId: string | null
  projectName: string
  hours: number
}

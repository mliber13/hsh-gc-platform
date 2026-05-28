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

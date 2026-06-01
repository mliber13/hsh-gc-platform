// ============================================================================
// HR Payroll — pay_periods.payload shape (shared with Drywall app)
// ============================================================================

export type PayrollPersonType = 'w2' | '1099'

export interface PayrollHourEntry {
  id?: string
  jobId?: string
  jobName?: string
  hours?: number | string
  rateOverride?: number | string
  overtimeType?: 'regular' | '1.5' | '2' | string
  assignToPersonId?: string
  assignToPersonName?: string
  assignRate?: number | string
  assignAmount?: number | string
  helperPayReceived?: unknown[]
}

export interface PayrollPieceEntry {
  id?: string
  jobId?: string
  jobName?: string
  workType?: string
  phase?: string
  totalPhases?: number | string
  phasesCompleted?: number | string
  jobTotalSqft?: number | string
  rate?: number | string
  amount?: number | string
}

export interface PayrollEntry {
  personId: string
  personType: PayrollPersonType | string
  personName?: string
  hourEntries?: PayrollHourEntry[]
  hours?: number | string
  pieceEntries?: PayrollPieceEntry[]
  pieceTotal?: number | string
  reimbursement?: number | string
  perDiem?: number | string
  bankedHoursUsed?: number | string
  hoursToBank?: number | string
  gross?: number | string
  /** Per-person workflow lock during an unlocked run — inputs disabled when true. */
  done?: boolean
  helperPayReceived?: unknown[]
}

export interface PayPeriod {
  id: string
  startDate: string
  endDate: string
  completedAt?: string
  entries: PayrollEntry[]
  totalGross?: number
  locked?: boolean
  updated_at?: string
}

export interface MyPaystub {
  period_id: string
  period_label: string
  entries: PayrollEntry[]
}

export interface PayrollProjectOption {
  id: string
  name: string
  quote?: Record<string, unknown>
}

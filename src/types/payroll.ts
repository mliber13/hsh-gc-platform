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

/** Whether piece_key came from v3 drywall catalogs or legacy v2 quote work types. */
export type PayrollPieceCatalogSource = 'legacy' | 'v3_drywall'

export interface PayrollPieceEntry {
  id?: string
  jobId?: string
  jobName?: string
  /** v3 catalog piece key (finish scope id, drywall_hanging, rc_channel_labor, …). */
  piece_key?: string
  /** legacy v2 work type — still used when catalog_source is legacy or for older saved entries. */
  workType?: string
  catalog_source?: PayrollPieceCatalogSource
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
  /** Field measurement total sqft (metadata.legacy.fieldTakeoff.totalMeasuredSqft). */
  fieldMeasuredSqft?: number | null
  /**
   * Effective crew pay rates for this job: order-approved rates when set,
   * otherwise quote project rates (v3 project_* or v2 hanger/finisher).
   */
  laborRates?: {
    hangerRate: number | null
    finisherRate: number | null
    prepCleanRate: number | null
  }
}

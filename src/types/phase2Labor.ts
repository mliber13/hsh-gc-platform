/**
 * Phase 2: Real-time labor (timeclock) – type stubs only.
 * No endpoints or UI. See docs/phase-2-real-time-labor.md.
 */

/** Source of a labor_entries row. Extend DB check constraint when adding 'timeclock'. */
export type LaborSourceSystemPhase2 = 'manual' | 'qbo' | 'timeclock'

/** Approval status for timeclock-sourced labor. Phase 2 schema: add column to labor_entries. */
export type LaborApprovalStatus = 'pending' | 'approved'

/**
 * Shape of a time entry payload from an external timeclock (for future upsert into labor_entries).
 * TODO: Implement sync endpoint and map to labor_entries upsert (source_system, source_id, ...).
 */
export interface TimeEntryPayloadStub {
  id: string
  employeeId?: string
  projectId: string
  workDate: string
  periodStart?: string
  periodEnd?: string
  hours: number
  grossWages?: number
  approvalStatus?: LaborApprovalStatus
}

// ============================================================================
// Crew list + calendar: which projects, from scalars alone (P1-EGRESS-3)
// ============================================================================

import { isDrywallProjectClosed } from '@/types/drywall'
import type { CrewMeasureWorkflowStatus } from '@/lib/drywall/crewMeasureStatus'

/**
 * The crew list and calendar need a project for three things only: whether it belongs in
 * the drywall workspace, whether it is excluded, and — for a measurer — how far its field
 * takeoff has got. None of that needs the blob.
 *
 * Selecting full `metadata` shipped 1,160 KB across the 66 live crew-assigned projects, on
 * the page the crew open most often, against 23 KB for these scalars.
 */
export type CrewProjectScalarRow = {
  id: string
  name: string
  client: unknown
  address: unknown
  city?: string | null
  state?: string | null
  zip_code?: string | null
  status: string
  type: string
  app_scope?: unknown
  quote_sqft?: unknown
  quote_total_amount?: unknown
  quote_final_total?: unknown
  quote_version?: unknown
  /** Presence probe, not a value: `->0->>id` ships one string instead of the array. */
  quote_first_line_id?: string | null
  quote_first_breakdown_id?: string | null
  quote_outcome?: unknown
  takeoff_review_status?: string | null
  takeoff_updated_at?: string | null
  takeoff_measured_sqft?: unknown
}

/**
 * Shared by the list and the calendar so the two cannot drift into disagreeing about which
 * projects are drywall.
 *
 * The `->0->>id` probes stand in for "array is non-empty". Verified across every project
 * carrying a quote: 85 with non-empty `lineItems`, 20 with non-empty `breakdowns`, and an
 * `id` on the first element of all of them.
 */
export const CREW_PROJECT_SELECT = [
  'id',
  'name',
  'client',
  'address',
  'city',
  'state',
  'zip_code',
  'status',
  'type',
  'app_scope:metadata->>app_scope',
  'quote_sqft:metadata->legacy->quote->>sqft',
  'quote_total_amount:metadata->legacy->quote->>totalQuoteAmount',
  'quote_final_total:metadata->legacy->quote->>finalTotal',
  'quote_version:metadata->legacy->quote->>version',
  'quote_first_line_id:metadata->legacy->quote->lineItems->0->>id',
  'quote_first_breakdown_id:metadata->legacy->quote->breakdowns->0->>id',
  'quote_outcome:metadata->legacy->quote->>outcome',
  'takeoff_review_status:metadata->legacy->fieldTakeoff->>reviewStatus',
  'takeoff_updated_at:metadata->legacy->fieldTakeoff->>updatedAt',
  'takeoff_measured_sqft:metadata->legacy->fieldTakeoff->>totalMeasuredSqft',
].join(', ')

/** `> 0` on a value PostgREST handed back as a string. */
function positive(value: unknown): boolean {
  if (value == null || value === '') return false
  const n = Number(value)
  return Number.isFinite(n) && n > 0
}

/**
 * Scalar equivalent of `belongsInDrywallWorkspace`.
 *
 * Checked against the full-metadata gate across all 66 live crew-assigned projects: they
 * agree exactly. Two of those — Goodwill Multi and 27 West Main St — are dual-view rows with
 * a non-drywall `type` and no `app_scope`, reachable *only* through the quote-content
 * fallback, so dropping any of these terms takes a job in production off its crew's list.
 *
 * Mirrors the original term for term except that a quote whose *only* substantive content is
 * a populated `calculations` object — no sqft, no total, no line items, no breakdowns — reads
 * as not-drywall here. `calculations` is derived from sqft, so that combination does not
 * occur, and no live project is near it. If one ever appears it surfaces as a job missing
 * from a crew list, not as wrong data on a job.
 */
export function isDrywallCrewProjectRow(row: CrewProjectScalarRow): boolean {
  if (row.type === 'drywall') return true
  if (row.app_scope === 'DRYWALL_ONLY') return true
  if (String(row.quote_version ?? '') === '3' && row.quote_first_line_id != null) return true
  if (row.quote_first_breakdown_id != null) return true
  return (
    positive(row.quote_sqft) ||
    positive(row.quote_total_amount) ||
    positive(row.quote_final_total)
  )
}

export function isExcludedCrewProjectRow(row: CrewProjectScalarRow): boolean {
  if (isDrywallProjectClosed(row.status)) return true
  return row.quote_outcome === 'lost'
}

/**
 * Measure progress from the takeoff scalars.
 *
 * `crewMeasureWorkflowStatus` needs the whole takeoff to tell a draft from an empty one, but
 * it ends on `Boolean(updatedAt)` and every write path — the operator page and the measurer
 * RPC — stamps that, so these two scalars reproduce it. Confirmed against all 66 live crew
 * projects: zero disagreements.
 */
export function crewMeasureStatusFromScalars(
  row: CrewProjectScalarRow,
): CrewMeasureWorkflowStatus {
  const review = row.takeoff_review_status
  if (review === 'approved' || review === 'rejected' || review === 'pending_review') {
    return review
  }
  if (positive(row.takeoff_measured_sqft)) return 'in_progress'
  return row.takeoff_updated_at ? 'in_progress' : 'not_started'
}

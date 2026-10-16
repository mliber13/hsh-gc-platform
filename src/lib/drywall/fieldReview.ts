/**
 * The two approvals on a field takeoff (docs/DRYWALL_PROJECT_IA.md §13, Mark 2026-10-14):
 * the MEASUREMENT, then the LABOR RATES — and rates before ordering.
 *
 * Before the split they were one record reached two ways: the review banner (crew-submitted
 * takeoffs only) and the rate card's Approve, which wrote reviewStatus 'approved' and the rates
 * in one click. On office-measured jobs nothing ever set reviewStatus — saving the rates was the
 * approval, and saved rates are what the crew is shown as their pay. These rules read both eras
 * without a backfill:
 *
 *   measurement approved = reviewStatus 'approved', or — no review status at all (office-
 *                          measured, old flow) — rates already saved;
 *   rates approved       = measurement approved AND rates saved.
 *
 * A measurement sent back (rejected / pending) un-approves the rates for ordering purposes; the
 * saved rates themselves stay, so the crew's pay view does not change under them.
 */
import type { FieldTakeoff, FieldTakeoffChangeAfterApproval } from '@/types/drywall'
import { computeMeasuredSqft } from './fieldMeasurementUtils'

type ReviewFields = Pick<FieldTakeoff, 'reviewStatus' | 'reviewApprovedRates'>

export function hasSavedLaborRates(takeoff: ReviewFields | null | undefined): boolean {
  const rates = takeoff?.reviewApprovedRates as Record<string, unknown> | null | undefined
  return !!rates && rates.hangerRate != null
}

export function isMeasurementApproved(takeoff: ReviewFields | null | undefined): boolean {
  if (!takeoff) return false
  if (takeoff.reviewStatus === 'approved') return true
  return !takeoff.reviewStatus && hasSavedLaborRates(takeoff)
}

export function isLaborRatesApproved(takeoff: ReviewFields | null | undefined): boolean {
  return isMeasurementApproved(takeoff) && hasSavedLaborRates(takeoff)
}

export type FieldStep = 'measure' | 'approve_measurement' | 'approve_rates' | 'order'

/** The step the job is on — the first one not done. */
export function currentFieldStep(
  takeoff: ReviewFields | null | undefined,
  measuredSqft: number,
): FieldStep {
  if (measuredSqft <= 0) return 'measure'
  if (!isMeasurementApproved(takeoff)) return 'approve_measurement'
  if (!isLaborRatesApproved(takeoff)) return 'approve_rates'
  return 'order'
}

/** Job stages past Field: the job already went to Order, so ordering is not ahead of anything. */
const PAST_FIELD_STATUSES = new Set(['order', 'production', 'production-complete', 'closed'])

/**
 * Whether Field step 4 (material orders) is open. "Rates before ordering" (Mark, 2026-10-14)
 * governs a job still being set up. A job already past Field is open regardless: jobs that went
 * to Order before the four-step flow existed never recorded approved rates, and locking them out
 * stopped the owner adding an order to Lisbon Opportunity Homes in production (2026-10-16) —
 * while the Schedule page's order sheet, ungated, would take the same order.
 */
export function isOrderStepOpen(projectStatus: string | null | undefined, ratesApproved: boolean): boolean {
  return ratesApproved || (projectStatus != null && PAST_FIELD_STATUSES.has(projectStatus))
}

/**
 * An approval is a stamp, not a snapshot: the office can still change an approved measurement
 * (a missed area, a second phase), and nothing resets. So each such change is written down —
 * when, who, and the measured sqft before and after — and shown under the approval (Mark,
 * 2026-10-16: keep the approval, note the change). Returns `next` with the entry appended when
 * the measurement was approved as saved and its sqft moved by a whole square foot or more.
 */
export function recordChangeAfterApproval(
  saved: FieldTakeoff | null | undefined,
  next: FieldTakeoff,
  by: string,
  at: string,
): FieldTakeoff {
  if (!isMeasurementApproved(saved)) return next
  const fromSqft = Math.round(computeMeasuredSqft(saved?.measurements ?? []))
  const toSqft = Math.round(computeMeasuredSqft(next.measurements ?? []))
  if (fromSqft === toSqft) return next
  const entry: FieldTakeoffChangeAfterApproval = { at, by, fromSqft, toSqft }
  return { ...next, changesAfterApproval: [...(next.changesAfterApproval ?? []), entry] }
}

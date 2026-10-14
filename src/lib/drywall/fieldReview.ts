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
import type { FieldTakeoff } from '@/types/drywall'

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

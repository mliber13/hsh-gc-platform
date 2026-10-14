/**
 * The two approvals on a takeoff (IA §13). Cases from the live dry run, 2026-10-14: all 19 jobs
 * in field-measurement read as "measure"; 8 of 9 in order read as "order"; Moreland Hills - Neff
 * (order status, no review status, no saved rates) reads as needing approval.
 */
import { describe, expect, it } from 'vitest'
import {
  currentFieldStep,
  isLaborRatesApproved,
  isMeasurementApproved,
} from './fieldReview'

const rates = { hangerRate: 0.3, finisherRate: 0.575, prepCleanRate: 0.03 }

describe('field review', () => {
  it('a crew-submitted takeoff approved in review, rates not yet set', () => {
    const t = { reviewStatus: 'approved' as const }
    expect(isMeasurementApproved(t)).toBe(true)
    expect(isLaborRatesApproved(t)).toBe(false)
    expect(currentFieldStep(t, 3068)).toBe('approve_rates')
  })

  it('an office-measured job from the old flow: saving rates was the approval', () => {
    const t = { reviewApprovedRates: rates }
    expect(isMeasurementApproved(t)).toBe(true)
    expect(isLaborRatesApproved(t)).toBe(true)
    expect(currentFieldStep(t, 2588)).toBe('order')
  })

  it('Neff: no review, no rates — the measurement needs approving', () => {
    expect(currentFieldStep({}, 4000)).toBe('approve_measurement')
  })

  it('nothing measured is step 1, whatever else is set', () => {
    expect(currentFieldStep({ reviewStatus: 'approved', reviewApprovedRates: rates }, 0)).toBe('measure')
  })

  /** Rates hang off the measurement: sending it back re-locks ordering, rates stay saved. */
  it('a measurement sent back un-approves the rates for ordering', () => {
    for (const reviewStatus of ['rejected', 'pending_review'] as const) {
      const t = { reviewStatus, reviewApprovedRates: rates }
      expect(isMeasurementApproved(t)).toBe(false)
      expect(isLaborRatesApproved(t)).toBe(false)
      expect(currentFieldStep(t, 3000)).toBe('approve_measurement')
    }
  })

  it('rates saved without a hanger rate do not count', () => {
    expect(isLaborRatesApproved({ reviewStatus: 'approved', reviewApprovedRates: {} })).toBe(false)
  })
})

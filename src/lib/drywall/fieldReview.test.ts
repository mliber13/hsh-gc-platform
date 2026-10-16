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

describe('a job with no drywall (Kirtland - Kosem, 2026-10-16)', () => {
  it('an area recorded at 0 sqft is a measurement, so it can be approved', async () => {
    const { currentFieldStep, hasMeasurement } = await import('./fieldReview')
    const noDrywall = { measurements: [{ id: 'p', area: 'Ceiling patches', notes: 'No drywall needed', boards: [] }] }
    expect(hasMeasurement(noDrywall, 0)).toBe(true)
    expect(currentFieldStep(noDrywall, 0)).toBe('approve_measurement')
  })

  it('nothing recorded at all is still waiting on the measure', async () => {
    const { currentFieldStep, hasMeasurement } = await import('./fieldReview')
    expect(hasMeasurement({ measurements: [] }, 0)).toBe(false)
    expect(currentFieldStep({ measurements: [] }, 0)).toBe('measure')
    expect(currentFieldStep(null, 0)).toBe('measure')
  })
})

describe('rates on a job with no drywall', () => {
  const noDrywall = (review: Record<string, unknown> = {}) => ({
    measurements: [{ id: 'p', area: 'Ceiling patches', notes: 'No drywall needed', boards: [] }],
    ...review,
  })

  it('once its measurement is approved, step 3 is settled — nothing is priced by the sqft', async () => {
    const { currentFieldStep, isRatesStepSettled } = await import('./fieldReview')
    const approved = noDrywall({ reviewStatus: 'approved' })
    expect(isRatesStepSettled(approved, 0)).toBe(true)
    expect(currentFieldStep(approved, 0)).toBe('order')
  })

  it('not before the measurement is approved, and not once drywall is measured', async () => {
    const { isRatesStepSettled } = await import('./fieldReview')
    expect(isRatesStepSettled(noDrywall(), 0)).toBe(false)
    expect(isRatesStepSettled(noDrywall({ reviewStatus: 'approved' }), 100)).toBe(false)
  })
})

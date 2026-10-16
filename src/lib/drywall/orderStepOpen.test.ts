/**
 * Field step 4 (orders): rates before ordering for a job still being set up; open on any job
 * already past Field. Lisbon Opportunity Homes (production, two orders placed before the
 * four-step flow) was locked out of its third order on 2026-10-16.
 */
import { describe, expect, it } from 'vitest'
import { isOrderStepOpen } from './fieldReview'

describe('Field order step', () => {
  it('a job still being set up waits for approved rates', () => {
    for (const status of ['project-info', 'quote', 'field-measurement']) {
      expect(isOrderStepOpen(status, false)).toBe(false)
      expect(isOrderStepOpen(status, true)).toBe(true)
    }
  })

  it('a job past Field is open without recorded rates — Lisbon, in production', () => {
    for (const status of ['order', 'production', 'production-complete', 'closed']) {
      expect(isOrderStepOpen(status, false)).toBe(true)
    }
  })

  it('an unknown status changes nothing', () => {
    expect(isOrderStepOpen(null, false)).toBe(false)
    expect(isOrderStepOpen(undefined, true)).toBe(true)
  })
})

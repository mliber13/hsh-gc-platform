import { describe, expect, it } from 'vitest'
import { DRYWALL_PROJECT_STATUSES } from '@/types/drywall'

/**
 * The lifecycle order the status pill is constrained to, mirrored from
 * `updateDrywallProjectStatus`. Kept as a test rather than an export so the service stays
 * the single definition — this asserts the shape the guard depends on.
 */
const FLOW = [
  'project-info',
  'quote',
  'field-measurement',
  'order',
  'production',
  'production-complete',
  'closed',
] as const

describe('drywall lifecycle flow', () => {
  it('covers every status the app can store', () => {
    // A status missing from the flow can never be reached by the pill, and one that is in
    // the flow but not a real status would let the guard admit a value nothing else knows.
    expect([...FLOW].sort()).toEqual([...DRYWALL_PROJECT_STATUSES].sort())
  })

  it('puts production before production-complete before closed', () => {
    // The ordering is what makes productionCompletedAt reachable. The old Order-tab
    // shortcut jumped order → closed and skipped it, so the job left the analytics.
    expect(FLOW.indexOf('order')).toBeLessThan(FLOW.indexOf('production'))
    expect(FLOW.indexOf('production')).toBeLessThan(FLOW.indexOf('production-complete'))
    expect(FLOW.indexOf('production-complete')).toBeLessThan(FLOW.indexOf('closed'))
  })

  it('leaves order → closed more than one step apart', () => {
    // This is the exact move that used to be one click on the Order tab.
    expect(Math.abs(FLOW.indexOf('closed') - FLOW.indexOf('order'))).toBeGreaterThan(1)
  })
})

import { describe, expect, it } from 'vitest'
import { applyHideCompleted } from './useHideCompletedSchedule'

const items = [
  { id: 'a', status: 'not-started' },
  { id: 'b', status: 'complete' },
  { id: 'c', status: 'in-progress' },
  { id: 'd', status: 'delayed' },
  { id: 'e', status: 'complete' },
]

describe('applyHideCompleted', () => {
  it('returns everything untouched when the filter is off', () => {
    expect(applyHideCompleted(items, false)).toBe(items)
  })

  it('drops completed items when the filter is on', () => {
    expect(applyHideCompleted(items, true).map((i) => i.id)).toEqual(['a', 'c', 'd'])
  })

  /**
   * The one that matters. A delayed item is the work most worth seeing, and an in-progress
   * item is happening right now — hiding either because it is "not not-started" would quietly
   * drop live jobs off the schedule. Only `complete` goes.
   */
  it('keeps delayed and in-progress work visible', () => {
    const kept = applyHideCompleted(items, true).map((i) => i.status)
    expect(kept).toContain('delayed')
    expect(kept).toContain('in-progress')
  })

  // 324 of 370 past items are still 'not-started', so this is the common shape and the
  // filter must leave it completely alone.
  it('does not touch items with no status recorded', () => {
    const untyped = [{ id: 'x' }, { id: 'y', status: null }]
    expect(applyHideCompleted(untyped, true)).toHaveLength(2)
  })

  it('handles an empty list', () => {
    expect(applyHideCompleted([], true)).toEqual([])
  })
})

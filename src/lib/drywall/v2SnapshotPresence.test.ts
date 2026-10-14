import { describe, expect, it } from 'vitest'
import { hasRealV2Snapshot } from './v2SnapshotPresence'

describe('hasRealV2Snapshot', () => {
  /** Lakewood - Sweeney, created 2026-10-08: the blank v2 every new job gets. */
  it('the blank v2 a new job is created with is not a v2 quote', () => {
    expect(hasRealV2Snapshot({ sqft: '', breakdowns: [], version: 2, wallFinish: 'Level 4' })).toBe(false)
    expect(hasRealV2Snapshot(null)).toBe(false)
    expect(hasRealV2Snapshot({ breakdowns: [{ sqft: '' }] })).toBe(false)
  })

  it('any sqft, breakdown sqft or total makes it real', () => {
    expect(hasRealV2Snapshot({ sqft: '2400' })).toBe(true)
    expect(hasRealV2Snapshot({ sqft: '', breakdowns: [{ sqft: 1200 }] })).toBe(true)
    expect(hasRealV2Snapshot({ totalQuoteAmount: 18450 })).toBe(true)
    expect(hasRealV2Snapshot({ calculations: { finalTotal: 9100 } })).toBe(true)
  })
})

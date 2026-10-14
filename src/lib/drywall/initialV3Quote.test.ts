import { describe, expect, it } from 'vitest'
import { hydrateDrywallQuote } from './createEmptyDrywallQuote'
import { buildV3FromV2 } from './convertQuoteV2ToV3'
import { createEmptyDrywallQuoteV3, hydrateDrywallQuoteV3 } from './createEmptyDrywallQuoteV3'
import { initialV3Quote, isUnstartedQuote } from './initialV3Quote'
import { hasRealV2Snapshot } from './v2SnapshotPresence'
import type { DrywallQuote } from '@/types/drywall'

const blankV2 = () => hydrateDrywallQuote({} as never)
const roundTrip = <T,>(q: T): Record<string, unknown> =>
  hydrateDrywallQuoteV3(JSON.parse(JSON.stringify(q))) as unknown as Record<string, unknown>

describe('initial v3 quote', () => {
  /** Lakewood - Sweeney: created with {}, opened 2026-10-08, got a blank v2 snapshot. */
  it('a quote never started is built as v3 with no v2 snapshot', () => {
    for (const raw of [{}, undefined, null]) {
      expect(isUnstartedQuote(raw)).toBe(true)
      const q = initialV3Quote(raw, blankV2())
      expect(q.version).toBe(3)
      expect(q.legacyV2Snapshot).toBeUndefined()
    }
  })

  /**
   * The guard: a fresh v3 must be what the blank-v2 conversion produced, field for field —
   * otherwise new quotes silently change (it lacked PDF settings, build type and the burden
   * switches until this change). Only the snapshot and timestamps may differ.
   */
  it('matches what a new job got from the blank-v2 conversion, minus the snapshot', () => {
    const viaBlankV2 = roundTrip(buildV3FromV2(blankV2()))
    const fresh = roundTrip(createEmptyDrywallQuoteV3())
    for (const key of new Set([...Object.keys(viaBlankV2), ...Object.keys(fresh)])) {
      if (key === 'legacyV2Snapshot' || key === 'updatedAt') continue
      expect([key, fresh[key]]).toEqual([key, viaBlankV2[key]])
    }
    expect(viaBlankV2.legacyV2Snapshot).toBeDefined()
    expect(fresh.legacyV2Snapshot).toBeUndefined()
  })

  it('a stored v2 quote still converts and keeps its snapshot', () => {
    const raw = { version: 2, sqft: '2400', breakdowns: [] }
    const q = initialV3Quote(raw, hydrateDrywallQuote(raw as unknown as DrywallQuote))
    expect(q.legacyV2Snapshot).toBeDefined()
    expect(hasRealV2Snapshot(q.legacyV2Snapshot)).toBe(true)
  })

  it('anything stored counts as started, even with no sqft', () => {
    expect(isUnstartedQuote({ scopeOfWork: 'Hang and finish garage' })).toBe(false)
  })
})

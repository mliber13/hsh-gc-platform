/**
 * Refresh must refuse when it would empty a quote.
 *
 * A quote priced directly in v3 carries a legacyV2Snapshot that is an empty husk
 * — sqft "", no breakdowns — because there was never a v2 quote to snapshot.
 * Rebuilding from it yields nothing. 5084 Neptune Oval (DW-2026-074, sent) lost
 * its only priced line this way on 2026-09-14, and a sweep found 59 more quotes
 * one click from the same fate, 19 of them sent or approved and the largest
 * carrying 17 lines.
 */
import { describe, expect, it } from 'vitest'
import { refreshWouldEmptyQuote } from './staleV3ConvertAudit'

/** The husk: what a hand-priced v3 quote carries. */
const EMPTY_SNAPSHOT = { sqft: '', breakdowns: [] }

/** A real v2 quote worth rebuilding from. */
const REAL_SNAPSHOT = {
  sqft: '4000',
  wastePercentage: '10',
  hangerRate: '0.35',
  finisherRate: '0.725',
  materialRate: '0.66',
  breakdowns: [{ id: 'b1', description: 'Main', sqft: '4000' }],
}

const ONE_LINE = { lineItems: [{ id: 'l1', type: 'drywall', location: 'Main Scope', quantity: 23327 }] }

describe('refreshWouldEmptyQuote', () => {
  it('refuses the Neptune Oval shape — priced lines, husk snapshot', () => {
    expect(refreshWouldEmptyQuote(ONE_LINE, EMPTY_SNAPSHOT)).toBe(true)
  })

  it('allows a refresh that actually rebuilds something', () => {
    expect(refreshWouldEmptyQuote(ONE_LINE, REAL_SNAPSHOT)).toBe(false)
  })

  it('does not block a quote that is already empty', () => {
    // Nothing to lose, and refreshing may be how the operator recovers it.
    expect(refreshWouldEmptyQuote({ lineItems: [] }, EMPTY_SNAPSHOT)).toBe(false)
    expect(refreshWouldEmptyQuote({}, EMPTY_SNAPSHOT)).toBe(false)
  })

  it('refuses when the snapshot cannot be converted at all', () => {
    expect(refreshWouldEmptyQuote(ONE_LINE, null)).toBe(true)
    expect(refreshWouldEmptyQuote(ONE_LINE, 'nonsense')).toBe(true)
  })

  it('refuses a multi-line quote just the same — that is the worst case', () => {
    // Bridgeworks carries 17 priced lines and is sent.
    const many = { lineItems: Array.from({ length: 17 }, (_, i) => ({ id: `l${i}`, type: 'drywall', quantity: 100 })) }
    expect(refreshWouldEmptyQuote(many, EMPTY_SNAPSHOT)).toBe(true)
  })
})

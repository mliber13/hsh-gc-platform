import { describe, expect, it } from 'vitest'
import { withSingleQuoteArchive } from './staleV3ConvertAudit'

describe('withSingleQuoteArchive', () => {
  it('replaces every earlier archive with one', () => {
    // A real project carried eight of these. Each is a whole quote.
    const legacy = {
      quote: { v: 'current' },
      fieldTakeoff: { keep: true },
      'quote_v3_archive_2026-07-09T11-47-48-757Z': { v: 'old' },
      'quote_v3_archive_2026-09-08T16-35-10-564Z': { v: 'older' },
    }

    const next = withSingleQuoteArchive(legacy, { v: 'just replaced' })

    expect(Object.keys(next).filter((k) => k.startsWith('quote_v3_archive'))).toEqual([
      'quote_v3_archive',
    ])
    expect(next.quote_v3_archive).toEqual({ v: 'just replaced' })
  })

  it('leaves everything else alone', () => {
    const legacy = { quote: { v: 1 }, fieldTakeoff: { areas: [] }, orders: [{ id: 'o1' }] }

    const next = withSingleQuoteArchive(legacy, { v: 0 })

    expect(next.fieldTakeoff).toBe(legacy.fieldTakeoff)
    expect(next.orders).toBe(legacy.orders)
    expect(next.quote).toBe(legacy.quote)
  })
})

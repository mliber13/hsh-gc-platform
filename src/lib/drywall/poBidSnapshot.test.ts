import { describe, expect, it } from 'vitest'
import { buildPoBidSnapshot, DEFAULT_PO_SCOPE_TEXT } from './poBidSnapshot'

describe('buildPoBidSnapshot', () => {
  it('throws when sqft or rate is zero', () => {
    expect(() => buildPoBidSnapshot(0, 1.5, 'Scope', '2026-06-01T00:00:00.000Z')).toThrow()
    expect(() => buildPoBidSnapshot(1000, 0, 'Scope', '2026-06-01T00:00:00.000Z')).toThrow()
  })

  it('builds exact totals for valid inputs', () => {
    const at = '2026-06-01T12:00:00.000Z'
    const snap = buildPoBidSnapshot(12000, 2.5, 'Hang and finish per PO', at)
    expect(snap.total).toBe(30000)
    expect(snap.at).toBe(at)
    expect(snap.payload.bidTotal).toBe(30000)
    expect(snap.payload.routineSubtotal).toBe(30000)
    expect(snap.payload.lineItems).toHaveLength(1)
    expect(snap.payload.lineItems[0]).toMatchObject({
      id: 'po-line-1',
      type: 'drywall',
      description: 'Hang and finish per PO',
      computed_line_total: 30000,
    })
  })

  it('uses default scope text when empty', () => {
    const snap = buildPoBidSnapshot(1000, 1, '   ', '2026-06-01T00:00:00.000Z')
    expect(snap.payload.lineItems[0].description).toBe(DEFAULT_PO_SCOPE_TEXT)
  })
})

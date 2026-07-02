import { describe, expect, it } from 'vitest'
import { deriveDrywallScopeRevenue } from './drywallScopeRevenue'
import type { BidSnapshot } from '@/types/drywall'

function snapshot(payload: BidSnapshot['payload']): BidSnapshot {
  return { total: payload.bidTotal, at: '2026-07-01T12:00:00.000Z', payload }
}

describe('deriveDrywallScopeRevenue', () => {
  it('allocates sell price proportionally when drywall shares the bid with FRP', () => {
    const snap = snapshot({
      routineSubtotal: 10_000,
      cleanupTotal: 0,
      overhead: 2_000,
      profit: 3_000,
      salesTax: 0,
      bidTotal: 15_000,
      lineItems: [
        { id: 'dw', type: 'drywall', description: 'Hang & finish', computed_line_total: 8_000 },
        { id: 'frp', type: 'frp', description: 'FRP panels', computed_line_total: 2_000 },
      ],
      alternates: [],
    })

    expect(deriveDrywallScopeRevenue(snap)).toBe(12_000)
  })

  it('returns full bid total for a pure-drywall snapshot', () => {
    const snap = snapshot({
      routineSubtotal: 5_000,
      cleanupTotal: 100,
      overhead: 500,
      profit: 400,
      salesTax: 0,
      bidTotal: 6_000,
      lineItems: [
        { id: 'dw', type: 'drywall', description: 'Board', computed_line_total: 5_000 },
      ],
      alternates: [],
    })

    expect(deriveDrywallScopeRevenue(snap)).toBe(6_000)
  })

  it('returns null for missing or empty snapshots', () => {
    expect(deriveDrywallScopeRevenue(null)).toBeNull()
    expect(
      deriveDrywallScopeRevenue({ total: 0, at: '2026-01-01', payload: undefined as never }),
    ).toBeNull()
    expect(
      deriveDrywallScopeRevenue(
        snapshot({
          routineSubtotal: 0,
          cleanupTotal: 0,
          overhead: 0,
          profit: 0,
          salesTax: 0,
          bidTotal: 1_000,
          lineItems: [],
          alternates: [],
        }),
      ),
    ).toBeNull()
  })
})

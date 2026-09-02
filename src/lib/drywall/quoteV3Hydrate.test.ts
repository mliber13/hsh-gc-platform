import { describe, expect, it } from 'vitest'
import {
  createEmptyDrywallQuoteV3,
  createQuoteLineItem,
  hydrateDrywallQuoteV3,
  prepareDrywallQuoteV3ForSave,
} from './createEmptyDrywallQuoteV3'
import type { QuoteLineItem } from '@/types/drywall'

describe('hydrateDrywallQuoteV3 round-trips per-type line geometry', () => {
  it('preserves acoustic, grid and metal-stud fields through save → hydrate', () => {
    const acoustic: QuoteLineItem = {
      ...createQuoteLineItem('acoustic', { location: 'Lobby' }),
      quantity: 1000,
      grid_perimeter: 130,
      acst_tile_size: '2x2',
      grid_count_overrides: { tiles: 250, mains: 42 },
    }
    const stud: QuoteLineItem = {
      ...createQuoteLineItem('metal_stud', { location: 'Corridor' }),
      quantity: 200,
      ms_wall_height: 13,
      ms_spacing_in: 16,
      ms_tracks_per_run: 2,
      ms_deflection_tracks_per_run: 1,
      ms_size: '6',
      ms_gauge: '20',
    }
    const quote = {
      ...createEmptyDrywallQuoteV3(),
      lineItems: [acoustic, stud],
    }

    // Simulate the persist → fetch cycle.
    const saved = prepareDrywallQuoteV3ForSave(quote)
    const hydrated = hydrateDrywallQuoteV3(saved)

    const a = hydrated.lineItems.find((l) => l.type === 'acoustic')!
    expect(a.grid_perimeter).toBe(130)
    expect(a.acst_tile_size).toBe('2x2')
    expect(a.grid_count_overrides).toEqual({ tiles: 250, mains: 42 })

    const s = hydrated.lineItems.find((l) => l.type === 'metal_stud')!
    expect(s.ms_wall_height).toBe(13)
    expect(s.ms_spacing_in).toBe(16)
    expect(s.ms_tracks_per_run).toBe(2)
    expect(s.ms_deflection_tracks_per_run).toBe(1)
    expect(s.ms_size).toBe('6')
    expect(s.ms_gauge).toBe('20')
  })
})

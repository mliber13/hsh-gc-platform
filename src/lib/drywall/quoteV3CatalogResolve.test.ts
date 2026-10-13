/**
 * Finisher rate precedence on a quote line: line → (Hang Only: nothing to finish) → project →
 * scope. Live check 2026-10-13: the Hang Only rule moved no quote — Goodwill's and Droblyen's
 * partial-finish lines already carried a line rate of 0. Firetape Only keeps the project rate:
 * Poland's project rate ($0.57) is the fire-tape price it was quoted at.
 */
import { describe, expect, it } from 'vitest'
import { getEffectiveFinisherRate, type LaborRateCatalogSlice } from './quoteV3CatalogResolve'
import type { QuoteLineItem } from '@/types/drywall'

const catalogs: LaborRateCatalogSlice = {
  boards: [{ id: '5_8_type_x', hanger_rate: 0.3 }],
  finish_scopes: [
    { id: 'level_4', finisher_rate: 0.32 },
    { id: 'hang_only', finisher_rate: 0 },
    { id: 'firetape_only', finisher_rate: 0.1 },
  ],
}
const line = (finish_scope_id: string, custom_finisher_rate?: number) =>
  ({ type: 'drywall', catalog_id: '5_8_type_x', finish_scope_id, custom_finisher_rate }) as QuoteLineItem

describe('getEffectiveFinisherRate', () => {
  it('a Hang Only line prices no finishing, even with a project finisher rate', () => {
    expect(getEffectiveFinisherRate(line('hang_only'), catalogs, 0.525)).toBe(0)
  })

  it('an explicit line rate still wins on Hang Only', () => {
    expect(getEffectiveFinisherRate(line('hang_only', 0.05), catalogs, 0.525)).toBe(0.05)
  })

  it('Firetape Only keeps the project rate — it can be the quoted fire-tape price', () => {
    expect(getEffectiveFinisherRate(line('firetape_only'), catalogs, 0.570776)).toBe(0.570776)
    expect(getEffectiveFinisherRate(line('firetape_only'), catalogs)).toBe(0.1)
  })

  it('finished lines are unchanged: line, then project, then scope', () => {
    expect(getEffectiveFinisherRate(line('level_4', 0.4), catalogs, 0.525)).toBe(0.4)
    expect(getEffectiveFinisherRate(line('level_4'), catalogs, 0.525)).toBe(0.525)
    expect(getEffectiveFinisherRate(line('level_4'), catalogs)).toBe(0.32)
  })
})

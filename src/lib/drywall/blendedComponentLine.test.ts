/**
 * When a component line is priced as a lump sum rather than from its takeoff.
 *
 * `custom_material_rate` switches grid / acoustic / metal-stud lines to qty × rate
 * and stops the engine computing a parts breakdown — so the stud, track, tile and
 * screw counts in the pivot all drop to 0. That is right for a converted v2 line
 * (re-itemising would change the price) but it also fires when an operator types a
 * material rate, and until now the itemisation just vanished. P1-MONEY-5: the
 * maths is defensible, the silence was not.
 */
import { describe, expect, it } from 'vitest'
import { isBlendedComponentLine } from './quoteV3CatalogResolve'
import type { QuoteLineItem } from '@/types/drywall'

const line = (patch: Partial<QuoteLineItem>): QuoteLineItem =>
  ({ id: 'l1', location: 'A', quantity: 100, ...patch }) as QuoteLineItem

describe('isBlendedComponentLine', () => {
  it('is true for a component line carrying a flat material rate', () => {
    // All three live migrated lines on RHM Office Expansion look like this.
    for (const type of ['metal_stud', 'suspended_grid', 'acoustic', 'rc_channel']) {
      expect(isBlendedComponentLine(line({ type, custom_material_rate: 17.24 } as Partial<QuoteLineItem>))).toBe(true)
    }
  })

  it('is false when the line prices from its takeoff', () => {
    expect(isBlendedComponentLine(line({ type: 'metal_stud' } as Partial<QuoteLineItem>))).toBe(false)
  })

  it('treats a zero rate as blended, because the engine does', () => {
    // qty x 0 is still the lump-sum branch — the breakdown is gone either way,
    // so the notice must appear rather than leaving a silently empty pivot.
    expect(isBlendedComponentLine(line({ type: 'acoustic', custom_material_rate: 0 } as Partial<QuoteLineItem>))).toBe(true)
  })

  it('never applies to drywall, which has no itemised takeoff to lose', () => {
    expect(isBlendedComponentLine(line({ type: 'drywall', custom_material_rate: 0.66 } as Partial<QuoteLineItem>))).toBe(false)
  })
})

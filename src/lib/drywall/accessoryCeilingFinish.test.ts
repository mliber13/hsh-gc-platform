/**
 * The field page sized compound from the v2 snapshot's ceiling finish, which is blank on a quote
 * born v3 — so Level 4/5 jobs got the default rate, over twice the all-purpose compound.
 */
import { describe, expect, it } from 'vitest'
import { calculateFieldAccessories, quoteInputFromDrywallQuote } from './accessoryCalc'
import type { DrywallQuoteV2V3 } from '@/types/drywall'

const allPurpose = (quote: DrywallQuoteV2V3) =>
  calculateFieldAccessories(9600, 0, quoteInputFromDrywallQuote(quote)).find((a) => a.subtype === 'All Purpose Joint Compound')
    ?.quantity

describe('ceiling finish for field accessories', () => {
  it('a v3 quote sizes compound from its own ceiling finish, not the blank v2 snapshot', () => {
    const v3 = { version: 3, ceiling_finish: 'Level 4 Smooth', legacyV2Snapshot: { ceilingFinish: '' } } as unknown as DrywallQuoteV2V3
    expect(quoteInputFromDrywallQuote(v3).ceilingFinish).toBe('Level 4 Smooth')
    expect(allPurpose(v3)).toBe('10') // 9600 / 4800 × 5
  })

  it('a v3 "Other" finish reads the typed-in text', () => {
    const v3 = { version: 3, ceiling_finish: 'Other', ceiling_finish_other: 'Splatter Knockdown' } as unknown as DrywallQuoteV2V3
    expect(allPurpose(v3)).toBe('18') // × 9
  })

  it('a converted quote with no v3 finish falls back to its snapshot', () => {
    const v3 = { version: 3, legacyV2Snapshot: { ceilingFinish: 'Stomp' } } as unknown as DrywallQuoteV2V3
    expect(allPurpose(v3)).toBe('22') // × 11
  })

  it('v2 quotes read as before', () => {
    const v2 = { ceilingFinish: 'Level 5 Smooth', ceilingFinishOther: '' } as unknown as DrywallQuoteV2V3
    expect(allPurpose(v2)).toBe('10')
  })
})

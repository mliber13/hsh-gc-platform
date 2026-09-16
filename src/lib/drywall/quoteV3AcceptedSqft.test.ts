import { describe, expect, it } from 'vitest'
import { createDefaultDrywallCatalogSeeds } from './catalogSeeds'
import { createEmptyDrywallQuoteV3, createQuoteLineItem } from './createEmptyDrywallQuoteV3'
import { computeQuoteV3Totals } from './quoteV3Math'
import type { DrywallQuoteV3, QuoteLineItem } from '@/types/drywall'

// Regression cover for the quote header reporting only line-item sqft while an
// accepted alternate changed the job: Madison - Pastor read 2,045 with waste when
// a selected deduct made it 1,660, and Brunswick - Brock read 2,971 against an
// actual 5,144. acceptedSqftWithWaste is what the field and order stages compare
// against, so it has to net the accepted alternates the same way acceptedSqft does.

function drywallLine(quantity: number, wastePct?: number): QuoteLineItem {
  return { ...createQuoteLineItem('drywall'), quantity, waste_pct: wastePct } as QuoteLineItem
}

function quoteWithAlternate(opts: {
  baseQty: number
  altQty: number
  pricingMode: 'add' | 'deduct'
  selected: boolean
}): DrywallQuoteV3 {
  const quote = createEmptyDrywallQuoteV3()
  quote.lineItems = [drywallLine(opts.baseQty)]
  quote.alternates = [
    {
      id: 'alt-1',
      name: 'Alternate',
      pricingMode: opts.pricingMode,
      selected: opts.selected,
      lineItems: [drywallLine(opts.altQty)],
    },
  ] as DrywallQuoteV3['alternates']
  return quote
}

const catalogs = createDefaultDrywallCatalogSeeds()
const totalsFor = (quote: DrywallQuoteV3) => computeQuoteV3Totals(quote, catalogs)

describe('accepted alternate sqft', () => {
  it('nets an accepted deduct out of both sqft figures (Madison - Pastor shape)', () => {
    const totals = totalsFor(
      quoteWithAlternate({ baseQty: 1859.27, altQty: 350, pricingMode: 'deduct', selected: true }),
    )

    expect(Math.round(totals.totalSqftWithWaste)).toBe(2045)
    expect(Math.round(totals.acceptedSqft)).toBe(1509)
    expect(Math.round(totals.acceptedSqftWithWaste)).toBe(1660)
  })

  it('adds an accepted add-alternate into both sqft figures', () => {
    const totals = totalsFor(
      quoteWithAlternate({ baseQty: 1000, altQty: 500, pricingMode: 'add', selected: true }),
    )

    expect(Math.round(totals.totalSqftWithWaste)).toBe(1100)
    expect(Math.round(totals.acceptedSqft)).toBe(1500)
    expect(Math.round(totals.acceptedSqftWithWaste)).toBe(1650)
  })

  it('ignores an alternate the customer has not accepted', () => {
    const totals = totalsFor(
      quoteWithAlternate({ baseQty: 1000, altQty: 500, pricingMode: 'deduct', selected: false }),
    )

    expect(Math.round(totals.acceptedSqft)).toBe(1000)
    expect(Math.round(totals.acceptedSqftWithWaste)).toBe(1100)
  })

  it('leaves a quote with no alternates reporting the same net as base', () => {
    const quote = createEmptyDrywallQuoteV3()
    quote.lineItems = [drywallLine(1200)]
    const totals = totalsFor(quote)

    expect(Math.round(totals.acceptedSqft)).toBe(Math.round(totals.totalSqft))
    expect(Math.round(totals.acceptedSqftWithWaste)).toBe(Math.round(totals.totalSqftWithWaste))
  })
})

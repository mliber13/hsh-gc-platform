import { describe, expect, it } from 'vitest'
import type { DrywallQuote, DrywallQuoteCalculations } from '@/types/drywall'
import { getTradeSummaryLines } from './drywallQuotePdf'

function rcQuote(overrides: Partial<DrywallQuote> = {}): DrywallQuote {
  return {
    version: 2,
    sqft: 0,
    wastePercentage: 0,
    overheadPercentage: 0,
    profitPercentage: 0,
    salesTaxRate: 0,
    materialRate: 0,
    hangerRate: 0,
    finisherRate: 0,
    prepCleanRate: 0,
    includeRcChannel: true,
    rcChannelCeilingSpacing: 24,
    rcChannelWallSpacing: 24,
    rcChannelWastePercentage: 0,
    rcChannelRate: 10,
    rcChannelLaborRate: 0,
    breakdowns: [
      {
        id: 'floor-1',
        description: 'Floor 1',
        sqft: 0,
        rcChannelCeilingSqft: 100,
      },
    ],
    ...overrides,
  }
}

describe('V2 PDF trade summary', () => {
  it('includes RC channel priced from floor breakdowns', () => {
    const quote = rcQuote()
    const quoteForCalc = { ...quote, version: undefined }
    const lines = getTradeSummaryLines(quote, {}, quoteForCalc)

    expect(lines).toContainEqual({ label: 'RC Channel:', amount: 50 })
  })

  it('falls back to the project RC total when breakdowns contain no RC quantities', () => {
    const quote = rcQuote({
      breakdowns: [{ id: 'floor-1', description: 'Floor 1', sqft: 100 }],
    })
    const calculations: DrywallQuoteCalculations = { rcChannelTotal: 123.45 }
    const quoteForCalc = { ...quote, version: undefined }
    const lines = getTradeSummaryLines(quote, calculations, quoteForCalc)

    expect(lines).toContainEqual({ label: 'RC Channel:', amount: 123.45 })
  })
})

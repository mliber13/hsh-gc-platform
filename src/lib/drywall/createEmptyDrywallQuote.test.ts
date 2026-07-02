import { describe, expect, it } from 'vitest'
import {
  createEmptyDrywallQuote,
  hasRealDrywallV2QuoteData,
  shouldUseV2QuoteStage,
} from './createEmptyDrywallQuote'

describe('shouldUseV2QuoteStage', () => {
  it('returns false for an empty new-project shell', () => {
    expect(shouldUseV2QuoteStage(createEmptyDrywallQuote())).toBe(false)
    expect(hasRealDrywallV2QuoteData(createEmptyDrywallQuote())).toBe(false)
  })

  it('returns true when the user restored v2 from v3', () => {
    expect(
      shouldUseV2QuoteStage({
        ...createEmptyDrywallQuote(),
        preferV2QuoteEditor: true,
      }),
    ).toBe(true)
  })

  it('returns true when v2 has real quote data', () => {
    expect(
      shouldUseV2QuoteStage({
        ...createEmptyDrywallQuote(),
        sqft: '12000',
      }),
    ).toBe(true)
  })
})

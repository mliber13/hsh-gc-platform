/**
 * Quote option pricing — the two ways a priced adder could silently become free.
 *
 * Both were found on a real quote (DW-2026-057) where a $4,410.62 RFI adder
 * showed as $0.00 in the totals.
 */
import { describe, expect, it } from 'vitest'
import { buildDrywallQuoteCalculations } from './buildDrywallQuoteCalculations'
import { createEmptyDrywallQuote } from './createEmptyDrywallQuote'
import { sanitizeNumericInput } from '@/components/ui/numeric-input'
import type { DrywallQuote, QuoteOption } from '@/types/drywall'

function quoteWithOptions(options: QuoteOption[]): DrywallQuote {
  return {
    ...createEmptyDrywallQuote(),
    sqft: '1000',
    materialRate: '0.69',
    hangerRate: '0.50',
    finisherRate: '0.60',
    options,
  } as DrywallQuote
}

describe('selected options total honours the chosen pricing method', () => {
  it('uses the fixed price even when stale sqft and rate are left behind', () => {
    // Switching an option from a rate method to Fixed leaves the old sqft/rate
    // on the record. Inferring the method from their presence ignored the price.
    const calc = buildDrywallQuoteCalculations(
      quoteWithOptions([
        {
          id: 'o1',
          description: 'RFI adders',
          selected: true,
          pricingMethod: 'fixed',
          price: '4410.62',
          sqft: '9',
          rate: '325',
        },
      ]),
    )
    expect(calc.selectedOptionsTotal as number).toBeCloseTo(4410.62, 2)
  })

  it('uses sqft × rate for a specific-sqft option', () => {
    const calc = buildDrywallQuoteCalculations(
      quoteWithOptions([
        {
          id: 'o2',
          description: 'Phase 2 Door Install',
          selected: true,
          pricingMethod: 'specificSqft',
          sqft: '9',
          rate: '325',
        },
      ]),
    )
    expect(calc.selectedOptionsTotal as number).toBeCloseTo(2925, 2)
  })

  it('ignores unselected options', () => {
    const calc = buildDrywallQuoteCalculations(
      quoteWithOptions([
        { id: 'o3', selected: false, pricingMethod: 'fixed', price: '5000' },
      ]),
    )
    expect(calc.selectedOptionsTotal as number).toBe(0)
  })

  it('leaves older saved quotes with no recorded method unchanged', () => {
    const rateBased = buildDrywallQuoteCalculations(
      quoteWithOptions([{ id: 'o4', selected: true, sqft: '9', rate: '325' }]),
    )
    expect(rateBased.selectedOptionsTotal as number).toBeCloseTo(2925, 2)

    const priceOnly = buildDrywallQuoteCalculations(
      quoteWithOptions([{ id: 'o5', selected: true, price: '1200' }]),
    )
    expect(priceOnly.selectedOptionsTotal as number).toBeCloseTo(1200, 2)
  })

  it('sums a mixed set the way the sidebar shows it', () => {
    const calc = buildDrywallQuoteCalculations(
      quoteWithOptions([
        { id: 'a', selected: true, pricingMethod: 'specificSqft', sqft: '9', rate: '325' },
        { id: 'b', selected: true, pricingMethod: 'specificSqft', sqft: '9', rate: '325' },
        { id: 'c', selected: true, pricingMethod: 'specificSqft', sqft: '9', rate: '325' },
        { id: 'd', selected: true, pricingMethod: 'fixed', price: '4410.62' },
      ]),
    )
    // The real quote showed $8,775.00 with the adder dropped; it should be this.
    expect(calc.selectedOptionsTotal as number).toBeCloseTo(13185.62, 2)
  })
})

describe('sanitizeNumericInput', () => {
  it('keeps a thousands-separated figure instead of discarding it', () => {
    // type="number" reports "" for this, which is how the price became 0.
    expect(sanitizeNumericInput('4,410.62')).toBe('4410.62')
    expect(parseFloat(sanitizeNumericInput('4,410.62'))).toBeCloseTo(4410.62, 2)
  })

  it('strips spaces and underscores too', () => {
    expect(sanitizeNumericInput('12 500')).toBe('12500')
    expect(sanitizeNumericInput('1_000.5')).toBe('1000.5')
  })

  it('keeps only the first decimal point', () => {
    expect(sanitizeNumericInput('1.2.3')).toBe('1.23')
  })

  it('drops letters and stray symbols', () => {
    expect(sanitizeNumericInput('$1,234.50')).toBe('1234.50')
    expect(sanitizeNumericInput('12abc')).toBe('12')
  })

  it('rejects a minus unless negatives are allowed', () => {
    expect(sanitizeNumericInput('-50')).toBe('50')
    expect(sanitizeNumericInput('-50', true)).toBe('-50')
    expect(sanitizeNumericInput('5-0', true)).toBe('50')
  })

  it('passes through a value that was already clean', () => {
    expect(sanitizeNumericInput('4410.62')).toBe('4410.62')
    expect(sanitizeNumericInput('')).toBe('')
  })
})

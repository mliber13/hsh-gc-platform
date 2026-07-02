import { describe, expect, it } from 'vitest'
import { buildDrywallQuoteCalculations } from './buildDrywallQuoteCalculations'
import { createEmptyDrywallQuote } from './createEmptyDrywallQuote'
import { LABOR_TAX_RATE } from './calculations/quantityUtils'

describe('buildDrywallQuoteCalculations FRP labor', () => {
  it('includes install labor in FRP direct cost', () => {
    const quote = {
      ...createEmptyDrywallQuote(),
      includeFRP: true,
      frpSqft: '320',
      frpSheetRate: '50',
      frpLaborRate: '2.5',
      salesTaxRate: '7',
    }
    const calc = buildDrywallQuoteCalculations(quote)
    const laborBase = 320 * 2.5
    expect(calc.frpLaborCostBase).toBeCloseTo(laborBase, 2)
    expect(calc.frpLaborCost).toBeCloseTo(laborBase * (1 + LABOR_TAX_RATE), 2)
    expect(calc.frpTotalDirectCost).toBeGreaterThan(
      (calc.frpMaterialCost as number) + (calc.frpSalesTax as number),
    )
  })
})

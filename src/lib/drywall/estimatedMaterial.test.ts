import { describe, expect, it } from 'vitest'
import { computeEstimatedMaterial } from './estimatedMaterial'
import type { DrywallQuote } from '@/types/drywall'

function v2QuoteWithCalculations(
  calculations: Record<string, number>,
): DrywallQuote {
  return {
    version: 2,
    calculations,
  } as DrywallQuote
}

describe('computeEstimatedMaterial v2', () => {
  it('uses totalMaterialCost as authoritative tax-inclusive total (no double tax)', () => {
    const quote = v2QuoteWithCalculations({
      standardDrywallMaterialCost: 5_500,
      standardDrywallSalesTax: 500,
      suspendedGridMaterialCost: 5_000,
      salesTax: 1_000,
      totalMaterialCost: 11_000,
    })

    const result = computeEstimatedMaterial(quote, null)

    expect(result.totalWithTax).toBe(11_000)
    expect(result.salesTax).toBe(1_000)
    expect(result.totalPreTax).toBe(10_000)
    expect(result.totalWithTax).toBe(result.totalPreTax + result.salesTax)

    const componentSum = result.components.reduce((sum, row) => sum + row.amount, 0)
    expect(componentSum + result.salesTax).toBeCloseTo(result.totalWithTax, 2)
    expect(componentSum).toBeCloseTo(result.totalPreTax, 2)

    const drywall = result.components.find((row) => row.key === 'drywall')
    expect(drywall?.amount).toBe(5_000)
    const grid = result.components.find((row) => row.key === 'suspended_grid')
    expect(grid?.amount).toBe(5_000)
  })

  it('includes FRP material and tax omitted from totalMaterialCost aggregates', () => {
    const quote = v2QuoteWithCalculations({
      standardDrywallMaterialCost: 2_200,
      standardDrywallSalesTax: 200,
      frpMaterialCost: 3_000,
      frpSalesTax: 300,
      salesTax: 200,
      totalMaterialCost: 2_200,
    })

    const result = computeEstimatedMaterial(quote, null)

    expect(result.totalWithTax).toBe(5_500)
    expect(result.salesTax).toBe(500)
    expect(result.totalPreTax).toBe(5_000)
    expect(result.totalWithTax).toBe(result.totalPreTax + result.salesTax)

    const componentSum = result.components.reduce((sum, row) => sum + row.amount, 0)
    expect(componentSum + result.salesTax).toBeCloseTo(result.totalWithTax, 2)
    expect(componentSum).toBeCloseTo(result.totalPreTax, 2)

    const frp = result.components.find((row) => row.key === 'frp')
    expect(frp?.amount).toBe(3_000)
  })

  it('returns empty breakdown when v2 calculations are missing', () => {
    const quote = v2QuoteWithCalculations({})
    const result = computeEstimatedMaterial(quote, null)
    expect(result.totalWithTax).toBe(0)
    expect(result.components).toHaveLength(0)
  })
})

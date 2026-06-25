import { describe, expect, it } from 'vitest'
import {
  computePoEstimatedCost,
  computeQuoteEstimatedCost,
  evaluateMarginVsFloor,
  marginFloorIndicator,
} from './marginFloor'

describe('computeQuoteEstimatedCost', () => {
  it('sums routine subtotal and cleanup', () => {
    expect(computeQuoteEstimatedCost(8000, 500)).toBe(8500)
    expect(computeQuoteEstimatedCost(0, 0)).toBe(0)
  })
})

describe('computePoEstimatedCost', () => {
  it('multiplies field sqft by cost per sqft', () => {
    expect(computePoEstimatedCost(10000, 2.5)).toBe(25000)
    expect(computePoEstimatedCost(0, 2.5)).toBe(0)
  })
})

describe('evaluateMarginVsFloor', () => {
  const floor = 0.3

  it('returns null margin when bid total is zero', () => {
    const result = evaluateMarginVsFloor(0, 1000, floor)
    expect(result.marginPct).toBeNull()
    expect(result.belowFloor).toBe(false)
  })

  it('detects below-floor margin', () => {
    const result = evaluateMarginVsFloor(10000, 7500, floor)
    expect(result.marginPct).toBeCloseTo(0.25)
    expect(result.belowFloor).toBe(true)
  })

  it('detects at-floor margin', () => {
    const result = evaluateMarginVsFloor(10000, 7000, floor)
    expect(result.marginPct).toBeCloseTo(0.3)
    expect(result.belowFloor).toBe(false)
  })

  it('detects above-floor margin', () => {
    const result = evaluateMarginVsFloor(10000, 6500, floor)
    expect(result.marginPct).toBeCloseTo(0.35)
    expect(result.belowFloor).toBe(false)
  })
})

describe('marginFloorIndicator', () => {
  it('classifies red, yellow, and green bands', () => {
    expect(
      marginFloorIndicator(
        evaluateMarginVsFloor(10000, 7600, 0.3),
      ),
    ).toBe('red')
    expect(
      marginFloorIndicator(
        evaluateMarginVsFloor(10000, 6900, 0.3),
      ),
    ).toBe('yellow')
    expect(
      marginFloorIndicator(
        evaluateMarginVsFloor(10000, 6500, 0.3),
      ),
    ).toBe('green')
  })
})

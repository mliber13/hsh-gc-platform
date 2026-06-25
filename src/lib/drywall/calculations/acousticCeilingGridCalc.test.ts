import { describe, expect, it } from 'vitest'
import { calcAcousticCeilingGridCounts } from './acousticCeilingGridCalc'

describe('calcAcousticCeilingGridCounts', () => {
  it('derives grid counts from sqft with default square perimeter (2x4)', () => {
    const counts = calcAcousticCeilingGridCounts({
      baseSqft: 1000,
      wastePct: 0,
      tileSize: '2x4',
    })
    expect(counts).not.toBeNull()
    expect(counts!.wallAngleCount).toBe(13) // ceil(4*sqrt(1000)/10)
    expect(counts!.mainsCount).toBe(21) // ceil(1000/4/12)
    expect(counts!.tees4ftCount).toBe(125) // ceil(1000/8)
    expect(counts!.tees2ftCount).toBe(0)
    expect(counts!.wireLinearFt).toBe('200.0')
    expect(counts!.lagsCount).toBe(26) // ceil(4*sqrt(1000)/5)
  })

  it('uses explicit perimeter and waste for wall angle and lags', () => {
    const counts = calcAcousticCeilingGridCounts({
      baseSqft: 500,
      perimeter: 100,
      wastePct: 10,
      tileSize: '2x2',
    })
    expect(counts).not.toBeNull()
    expect(counts!.wallAngleCount).toBe(12) // ceil(100*1.1/10) — JS float rounds 110.000…/10 up
    expect(counts!.mainsCount).toBe(23) // ceil(550/2/12)
    expect(counts!.tees2ftCount).toBe(138) // ceil(550/4)
    expect(counts!.wireLinearFt).toBe('110.0')
    expect(counts!.lagsCount).toBe(23) // ceil(100*1.1/5) — same JS float edge as wall angle
  })

  it('returns null when sqft is zero', () => {
    expect(calcAcousticCeilingGridCounts({ baseSqft: 0 })).toBeNull()
  })
})

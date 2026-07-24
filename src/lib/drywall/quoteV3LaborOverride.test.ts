import { describe, expect, it } from 'vitest'
import { getEffectiveFinisherRate, getEffectiveHangerRate } from './quoteV3CatalogResolve'
import { V3_LINE_MIGRATION_OVERRIDE_REASON } from './convertQuoteV2ToV3'
import { laborAmountTooltip } from './quoteV3LineAmountTooltips'
import { computeLineItem } from './quoteV3Math'
import type { QuoteLineItem } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

const emptyCatalogs = {
  boards: [],
  finish_scopes: [],
  accessories: [],
  rc_channel: [],
  suspended_grid: [],
  insulation: [],
  acoustic: [],
  metal_stud: [],
  frp: [],
} as unknown as OrgDrywallCatalogs

function drywallLine(patch: Partial<QuoteLineItem> = {}): QuoteLineItem {
  return {
    id: 'line-1',
    type: 'drywall',
    description: 'Test',
    location: '',
    quantity: 1000,
    catalog_id: '',
    waste_pct: 10,
    ...patch,
  }
}

describe('getEffectiveHangerRate / getEffectiveFinisherRate', () => {
  it('prefers line overrides over project rates even with v2 migration reason', () => {
    const line = drywallLine({
      custom_hanger_rate: 0,
      custom_finisher_rate: 0.12,
      override_reason: V3_LINE_MIGRATION_OVERRIDE_REASON,
    })
    expect(getEffectiveHangerRate(line, emptyCatalogs, 0.4)).toBe(0)
    expect(getEffectiveFinisherRate(line, emptyCatalogs, 0.4)).toBe(0.12)
  })

  it('falls back to project rates when no line override', () => {
    const line = drywallLine()
    expect(getEffectiveHangerRate(line, emptyCatalogs, 0.35)).toBe(0.35)
    expect(getEffectiveFinisherRate(line, emptyCatalogs, 0.42)).toBe(0.42)
  })
})

describe('laborAmountTooltip', () => {
  it('matches computeLineItem for override rates with waste and burden', () => {
    const line = drywallLine({
      custom_hanger_rate: 0,
      custom_finisher_rate: 0.12,
    })
    const laborBurden = {
      projectHangerRate: 0.4,
      projectFinisherRate: 0.4,
      hangerIncludeLaborBurden: true,
      finisherIncludeLaborBurden: true,
    }
    const computed = computeLineItem(line, emptyCatalogs, laborBurden)
    // 1000 × 1.1 × 0.12 × 1.25 = 165
    expect(computed.laborTotal).toBeCloseTo(165, 5)

    const tip = laborAmountTooltip(line, emptyCatalogs, computed, laborBurden)
    expect(tip).toContain('$0.00/sqft hanger')
    expect(tip).toContain('$0.12/sqft finisher')
    expect(tip).toContain('1,100')
    expect(tip).toContain('$165.00')
    expect(tip).toContain('25% labor burden')
  })
})

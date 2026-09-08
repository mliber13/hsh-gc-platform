/**
 * Converter fixtures for the two mis-pricing bugs.
 *
 * Both survived a "$0.00 parity" claim because the parity fixture set contained
 * no FRP and no RC project — the paths were never exercised.
 */
import { describe, expect, it } from 'vitest'
import { buildV3FromV2 } from './convertQuoteV2ToV3'
import { createEmptyDrywallQuote } from './createEmptyDrywallQuote'
import { buildDrywallQuoteCalculations } from './buildDrywallQuoteCalculations'
import type { DrywallQuote } from '@/types/drywall'

describe('convertQuoteV2ToV3 — FRP material rate', () => {
  const frpQuote = (): DrywallQuote =>
    ({
      ...createEmptyDrywallQuote(),
      sqft: '1000',
      includeFRP: true,
      frpSqft: '320',
      frpSheetRate: '50', // $/SHEET, and v2 prices sheets = sqft / 32
      frpLaborRate: '2.5',
      salesTaxRate: '7',
    }) as DrywallQuote

  it('converts the per-sheet rate to a per-sqft rate', () => {
    const v2 = frpQuote()
    const calc = buildDrywallQuoteCalculations(v2)
    const frp = buildV3FromV2(v2).lineItems.find((l) => l.type === 'frp')

    expect(frp).toBeDefined()
    expect(frp?.quantity).toBe(320)

    // The bug: $50/sheet landing on a per-sqft line. 320 sqft is ten sheets, so
    // the rate must be near $50/32 ≈ $1.56, not $50.
    expect(frp?.custom_material_rate).toBeLessThan(10)

    // And it must reproduce what v2 actually charged for FRP material.
    const material = (frp?.custom_material_rate ?? 0) * (frp?.quantity ?? 0)
    expect(material).toBeCloseTo(calc.frpMaterialCost as number, 2)
  })

  it('does not multiply FRP material by roughly 32x', () => {
    const v2 = frpQuote()
    const calc = buildDrywallQuoteCalculations(v2)
    const frp = buildV3FromV2(v2).lineItems.find((l) => l.type === 'frp')
    const converted = (frp?.custom_material_rate ?? 0) * (frp?.quantity ?? 0)
    const v2Material = calc.frpMaterialCost as number
    // Guard the specific failure mode rather than just "close enough".
    expect(converted).toBeLessThan(v2Material * 2)
  })
})

describe('convertQuoteV2ToV3 — RC channel waste and accessories', () => {
  const rcQuote = (waste?: string): DrywallQuote =>
    ({
      ...createEmptyDrywallQuote(),
      sqft: '1000',
      includeRcChannel: true,
      rcChannelCeilingSqft: '1000',
      rcChannelCeilingSpacing: '24',
      rcChannelRate: '3.10',
      rcChannelLaborRate: '1.20',
      ...(waste !== undefined ? { rcChannelWastePercentage: waste } : {}),
    }) as DrywallQuote

  it('carries v2 waste rather than letting v3 apply its 10% default', () => {
    const rc = buildV3FromV2(rcQuote()).lineItems.find((l) => l.type === 'rc_channel')
    // v2 defaults RC waste to 0; v3's own default is 10, so an unset value has to
    // be written explicitly or the converted line silently gains 10% material.
    expect(rc?.waste_pct).toBe(0)
  })

  it('preserves a waste percentage the estimator did set', () => {
    const rc = buildV3FromV2(rcQuote('5')).lineItems.find((l) => l.type === 'rc_channel')
    expect(rc?.waste_pct).toBe(5)
  })

  it('keeps screws inside the migrated material rate', () => {
    const rc = buildV3FromV2(rcQuote()).lineItems.find((l) => l.type === 'rc_channel')
    // v2 prices fasteners within the piece rate. Without this flag v3 adds
    // fine-thread screw boxes on top, which v2 never charged for.
    expect(rc?.accessories_in_material_rate).toBe(true)
  })
})

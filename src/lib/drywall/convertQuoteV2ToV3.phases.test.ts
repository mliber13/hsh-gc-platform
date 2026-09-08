/**
 * Converter fixtures for a v2 quote broken down by phase.
 *
 * v2 stores RC channel, suspended grid and metal stud PER BREAKDOWN — the v2
 * editor labels those sections "(this floor)" and the engine sums them via
 * rcChannelBreakdownTotal. Drywall already converts one v3 line per breakdown;
 * these three did not, so a phased job lost both the split and — when the
 * quantities lived only in the breakdown rows — the quantities themselves,
 * which silently under-prices the converted quote.
 *
 * Acoustic and FRP are deliberately asserted as SINGLE lines: neither appears
 * in the per-breakdown editor, so quote-level is correct for them.
 */
import { describe, expect, it } from 'vitest'
import { buildV3FromV2 } from './convertQuoteV2ToV3'
import { createEmptyDrywallQuote } from './createEmptyDrywallQuote'
import { buildDrywallQuoteCalculations } from './buildDrywallQuoteCalculations'
import type { DrywallQuote, QuoteLineItem, QuoteLineItemType } from '@/types/drywall'

/** Three phases, each carrying its own RC / grid / metal-stud quantities. */
function phasedV2Quote(): DrywallQuote {
  return {
    ...createEmptyDrywallQuote(),
    hangerRate: '0.55',
    finisherRate: '0.65',
    prepCleanRate: '0.05',
    salesTaxRate: '7',
    overheadPercentage: '10',
    profitPercentage: '15',

    includeRcChannel: true,
    rcChannelCeilingSpacing: '24',
    rcChannelWallSpacing: '24',
    rcChannelRate: '3.10',
    rcChannelLaborRate: '1.20',

    includeSuspendedGrid: true,
    suspendedGridRate: '2.40',
    suspendedGridLaborRate: '1.10',

    includeMetalStudFraming: true,
    metalStudLaborRate: '12',

    breakdowns: [
      {
        id: 'b2',
        description: 'Phase 2',
        sqft: '4000',
        rcChannelCeilingSqft: '1200',
        suspendedGridSqft: '800',
        suspendedGridPerimeter: '120',
        metalStudWallLf: '300',
        metalStudWallHeight: '10',
        metalStudSpacing: '16',
        metalStudTracksPerRun: '2',
        metalStudSize: '3.625',
        metalStudGauge: '20',
      },
      {
        id: 'b3',
        description: 'Phase 3',
        sqft: '3000',
        rcChannelCeilingSqft: '900',
        suspendedGridSqft: '600',
        suspendedGridPerimeter: '100',
        metalStudWallLf: '250',
        metalStudWallHeight: '10',
        metalStudSpacing: '16',
        metalStudTracksPerRun: '2',
        metalStudSize: '3.625',
        metalStudGauge: '20',
      },
      {
        id: 'b4',
        description: 'Phase 4',
        sqft: '2000',
        rcChannelCeilingSqft: '600',
        suspendedGridSqft: '400',
        suspendedGridPerimeter: '80',
        metalStudWallLf: '200',
        metalStudWallHeight: '10',
        metalStudSpacing: '16',
        metalStudTracksPerRun: '2',
        metalStudSize: '3.625',
        metalStudGauge: '20',
      },
    ],
  } as DrywallQuote
}

function linesOfType(items: QuoteLineItem[], type: QuoteLineItemType): QuoteLineItem[] {
  return items.filter((l) => l.type === type)
}

const PHASES = ['Phase 2', 'Phase 3', 'Phase 4']

describe('convertQuoteV2ToV3 — phase breakdowns', () => {
  it('keeps one drywall line per phase (already working — the reference behaviour)', () => {
    const v3 = buildV3FromV2(phasedV2Quote())
    const drywall = linesOfType(v3.lineItems, 'drywall')
    expect(drywall).toHaveLength(3)
    expect(drywall.map((l) => l.location)).toEqual(PHASES)
    expect(drywall.map((l) => l.quantity)).toEqual([4000, 3000, 2000])
  })

  it('keeps one RC channel line per phase', () => {
    const v3 = buildV3FromV2(phasedV2Quote())
    const rc = linesOfType(v3.lineItems, 'rc_channel')
    expect(rc).toHaveLength(3)
    expect(rc.map((l) => l.location)).toEqual(PHASES)
    // 24" OC on ceiling => LF = sqft / 2
    expect(rc.map((l) => Math.round(l.quantity))).toEqual([600, 450, 300])
  })

  it('keeps one suspended grid line per phase', () => {
    const v3 = buildV3FromV2(phasedV2Quote())
    const grid = linesOfType(v3.lineItems, 'suspended_grid')
    expect(grid).toHaveLength(3)
    expect(grid.map((l) => l.location)).toEqual(PHASES)
    expect(grid.map((l) => l.quantity)).toEqual([800, 600, 400])
  })

  it('keeps one metal stud line per phase', () => {
    const v3 = buildV3FromV2(phasedV2Quote())
    const studs = linesOfType(v3.lineItems, 'metal_stud')
    expect(studs).toHaveLength(3)
    expect(studs.map((l) => l.location)).toEqual(PHASES)
    expect(studs.map((l) => l.quantity)).toEqual([300, 250, 200])
  })

  it('does not lose quantity: converted RC total matches what v2 priced', () => {
    const v2 = phasedV2Quote()
    const calc = buildDrywallQuoteCalculations(v2)
    const v3 = buildV3FromV2(v2)
    const convertedLf = linesOfType(v3.lineItems, 'rc_channel').reduce(
      (sum, l) => sum + l.quantity,
      0,
    )
    // v2 charged for RC across all three phases; conversion must carry the same
    // quantity, not the empty quote-level field.
    expect(calc.rcChannelTotalDirectCost as number).toBeGreaterThan(0)
    expect(convertedLf).toBeCloseTo(1350, 0)
  })

  it('falls back to a single line when the quote has no breakdowns', () => {
    const v2 = {
      ...createEmptyDrywallQuote(),
      sqft: '5000',
      includeRcChannel: true,
      rcChannelCeilingSqft: '1000',
      rcChannelCeilingSpacing: '24',
      rcChannelRate: '3.10',
      rcChannelLaborRate: '1.20',
      breakdowns: [],
    } as DrywallQuote
    const v3 = buildV3FromV2(v2)
    expect(linesOfType(v3.lineItems, 'drywall')).toHaveLength(1)
    expect(linesOfType(v3.lineItems, 'rc_channel')).toHaveLength(1)
  })

  it('leaves acoustic as a single line — v2 has no per-phase acoustic', () => {
    const v2 = { ...phasedV2Quote(), includeAcousticCeiling: true } as DrywallQuote
    v2.acousticCeilingSqft = '2500'
    v2.acousticCeilingPerimeter = '220'
    v2.acousticCeilingTileRate = '1.85'
    v2.acousticCeilingLaborRate = '0.95'
    const acoustic = linesOfType(buildV3FromV2(v2).lineItems, 'acoustic')
    expect(acoustic).toHaveLength(1)
    // Must use tile sqft, never the perimeter.
    expect(acoustic[0]?.quantity).toBe(2500)
  })
})

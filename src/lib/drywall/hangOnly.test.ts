/**
 * Hang sqft vs finish sqft.
 *
 * Every board is hung; hang-only board (Hardi, a double layer's base layer) is never finished.
 * Before the split one sqft number paid both trades, so a finisher was paid to finish Hardi and
 * the mud order grew with it. The job that surfaced it: Chardon - Droblyen, 2026-10-08 — 795
 * sqft of Hardi in the Cabin, which would have paid the finisher an extra $357.75 at $0.45.
 *
 * The property that matters most is the last describe block: on a job with no hang-only board
 * the two numbers are identical, so nobody else's pay moves.
 */
import { describe, expect, it } from 'vitest'
import { getSqftFromJob } from '@/lib/payrollMath'
import type { FieldMeasurementArea } from '@/types/drywall'
import { calculateFieldAccessories } from './accessoryCalc'
import { resolveCrewPaySqftFromMetadata } from './crewPayBasis'
import { computeMeasuredSqft } from './fieldMeasurementUtils'
import {
  defaultHangOnlyForBoardType,
  hangOnlyMeasuredSqft,
  isHangOnlyBoard,
  isHangOnlyQuoteLine,
  quotedFinishSqftWithWaste,
} from './hangOnly'

/** 4x12 sheets: 48 sqft each. */
function board(boardType: string, quantity: number, hangOnly?: boolean) {
  return {
    id: `${boardType}-${quantity}-${hangOnly}`,
    boardType,
    thickness: '1/2',
    width: '48',
    length: '12',
    quantity: String(quantity),
    ...(hangOnly === undefined ? {} : { hangOnly }),
  }
}

function area(...boards: ReturnType<typeof board>[]): FieldMeasurementArea {
  return { id: 'a', area: 'Cabin', boards }
}

function measuredJob(measurements: FieldMeasurementArea[]) {
  return {
    legacy: {
      fieldTakeoff: { totalMeasuredSqft: computeMeasuredSqft(measurements), measurements },
    },
  }
}

describe('what counts as hang only', () => {
  it('Cement defaults to hang only; everything else to finished', () => {
    expect(defaultHangOnlyForBoardType('Cement')).toBe(true)
    expect(defaultHangOnlyForBoardType('Standard')).toBe(false)
    expect(isHangOnlyBoard({ boardType: 'Cement' })).toBe(true)
    expect(isHangOnlyBoard({ boardType: 'Standard' })).toBe(false)
  })

  it('an explicit setting beats the board type, both ways', () => {
    // A double layer's base layer: same board, marked hang only.
    expect(isHangOnlyBoard({ boardType: 'Standard', hangOnly: true })).toBe(true)
    // Cement someone does finish.
    expect(isHangOnlyBoard({ boardType: 'Cement', hangOnly: false })).toBe(false)
  })

  it('quote lines: Hang Only, Firetape Only, or a 0 finisher rate', () => {
    expect(isHangOnlyQuoteLine({ type: 'drywall', finish_scope_id: 'hang_only' })).toBe(true)
    // Fire tape is not finisher pay.
    expect(isHangOnlyQuoteLine({ type: 'drywall', finish_scope_id: 'firetape_only' })).toBe(true)
    expect(isHangOnlyQuoteLine({ type: 'drywall', finish_scope_id: 'level_4', custom_finisher_rate: 0 })).toBe(true)
    expect(isHangOnlyQuoteLine({ type: 'drywall', finish_scope_id: 'level_4' })).toBe(false)
    expect(isHangOnlyQuoteLine({ type: 'drywall', finish_scope_id: 'level_4', custom_finisher_rate: 0.3 })).toBe(false)
    // An unset override is not a zero.
    expect(isHangOnlyQuoteLine({ type: 'drywall', finish_scope_id: 'level_4', custom_finisher_rate: '' })).toBe(false)
    expect(isHangOnlyQuoteLine({ type: 'insulation', finish_scope_id: 'hang_only' })).toBe(false)
  })
})

describe('measured jobs', () => {
  it('Hardi is hung but not finished', () => {
    // 100 sheets drywall (4,800) + 10 sheets cement (480).
    const job = measuredJob([area(board('Standard', 100), board('Cement', 10))])
    const r = resolveCrewPaySqftFromMetadata(job)
    expect(r.sqft).toBe(5280)
    expect(r.finishSqft).toBe(4800)
    expect(hangOnlyMeasuredSqft(job.legacy.fieldTakeoff.measurements)).toBe(480)
  })

  it('a double layer pays the hanger for both layers and the finisher for the top one', () => {
    const job = measuredJob([area(board('Fire-Resistant', 50), board('Fire-Resistant', 50, true))])
    const r = resolveCrewPaySqftFromMetadata(job)
    expect(r.sqft).toBe(4800)
    expect(r.finishSqft).toBe(2400)
  })

  it('accepted change-order sqft is added to both', () => {
    const job = measuredJob([area(board('Standard', 100), board('Cement', 10))])
    const withCo = {
      legacy: {
        ...job.legacy,
        changeOrders: [{ status: 'accepted', additionalCrewSqft: 200 }],
      },
    }
    const r = resolveCrewPaySqftFromMetadata(withCo)
    expect(r.sqft).toBe(5480)
    expect(r.finishSqft).toBe(5000)
  })
})

describe('unmeasured jobs fall back to the quote', () => {
  /** Droblyen's revised quote, as saved on 2026-10-08. */
  const droblyen = {
    legacy: {
      quote: {
        version: 3,
        lineItems: [
          { type: 'drywall', location: 'Cabin', catalog_id: '1_2_mr', finish_scope_id: 'level_4', quantity: 1874, waste_pct: 2 },
          { type: 'drywall', location: 'Garage', catalog_id: '1_2_mr', finish_scope_id: 'level_4', quantity: 5696, waste_pct: 2 },
          { type: 'drywall', location: 'Cabin', catalog_id: '1_2_cement', finish_scope_id: 'firetape_only', custom_finisher_rate: 0, quantity: 795, waste_pct: 2 },
        ],
      },
    },
  }

  it('the Hardi line is hung, not finished', () => {
    const r = resolveCrewPaySqftFromMetadata(droblyen)
    expect(r.baseSource).toBe('quoted')
    expect(r.sqft).toBe(Math.round((1874 + 5696 + 795) * 1.02))
    expect(r.finishSqft).toBe(Math.round((1874 + 5696) * 1.02))
    expect(quotedFinishSqftWithWaste(droblyen.legacy.quote)).toBe(r.finishSqft)
  })

  it('a v2 quote has no lines to tell apart, so both numbers match', () => {
    const r = resolveCrewPaySqftFromMetadata({ legacy: { quote: { version: 2, sqft: 3000, wastePercentage: 10 } } })
    expect(r.sqft).toBe(3300)
    expect(r.finishSqft).toBe(3300)
  })
})

describe('payroll picks the basis by piece', () => {
  const job = { metadata: measuredJob([area(board('Standard', 100), board('Cement', 10))]) }

  it('hang pieces get every board, finish pieces get the finished part', () => {
    expect(getSqftFromJob(job)).toBe(5280)
    expect(getSqftFromJob(job, 'hang')).toBe(5280)
    expect(getSqftFromJob(job, 'finish')).toBe(4800)
  })

  it('a caller with only the measured number gets it for both', () => {
    expect(getSqftFromJob({ fieldMeasuredSqft: 5280 }, 'finish')).toBe(5280)
  })
})

describe('mud and tape follow finish sqft; screws follow hang sqft', () => {
  const qty = (rows: ReturnType<typeof calculateFieldAccessories>, subtype: string) =>
    Number(rows.find((r) => r.subtype === subtype)?.quantity ?? 0)

  const all = calculateFieldAccessories(10000, 0, {})
  // A wide gap on purpose: compound comes in units big enough that a narrow one rounds away.
  const split = calculateFieldAccessories(10000, 0, {}, 2000)

  it('compound and tape drop with the hang-only board', () => {
    expect(qty(split, 'Easy Sand 90')).toBeLessThan(qty(all, 'Easy Sand 90'))
    expect(qty(split, 'All Purpose Joint Compound')).toBeLessThan(qty(all, 'All Purpose Joint Compound'))
  })

  it('screws do not — the Hardi still gets screwed on', () => {
    expect(qty(split, 'Drywall Screws 1-1/4"')).toBe(qty(all, 'Drywall Screws 1-1/4"'))
  })
})

describe('jobs without hang-only board are unchanged', () => {
  it('measured: finish sqft equals hang sqft', () => {
    const r = resolveCrewPaySqftFromMetadata(measuredJob([area(board('Standard', 80), board('Moisture-Resistant', 20))]))
    expect(r.finishSqft).toBe(r.sqft)
  })

  it('quoted: finish sqft equals hang sqft', () => {
    const r = resolveCrewPaySqftFromMetadata({
      legacy: { quote: { version: 3, lineItems: [{ type: 'drywall', finish_scope_id: 'level_4', quantity: 1000, waste_pct: 10 }] } },
    })
    expect(r.finishSqft).toBe(r.sqft)
  })

  it('omitting finish sqft from the accessory calc gives the same order as before', () => {
    expect(
      calculateFieldAccessories(8000, 12, {}).map((r) => [r.subtype, r.quantity]),
    ).toEqual(calculateFieldAccessories(8000, 12, {}, 8000).map((r) => [r.subtype, r.quantity]))
  })
})

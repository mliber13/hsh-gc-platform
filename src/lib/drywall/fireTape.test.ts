/**
 * Fire-taped board (Mark, 2026-10-12/13): hung, fire-taped, not finished. Out of finish sqft,
 * paid by a Firetape Only piece row at the job's fire-tape rate (the quote's, else the catalog's),
 * ordered tape and a third of the compound.
 */
import { describe, expect, it } from 'vitest'
import {
  boardFinish,
  fireTapedMeasuredSqft,
  jobFireTapeRate,
  withBoardFinish,
} from './fireTape'
import { hangOnlyMeasuredSqft } from './hangOnly'
import { mergeFieldTakeoff } from './fieldMeasurementUtils'
import { resolveCrewPaySqft } from './crewPayBasis'
import { projectLaborRateForPieceKey } from './payrollPieceKeys'
import { calculateFieldAccessories } from './accessoryCalc'
import type { FieldMeasurementBoard, FieldTakeoff } from '@/types/drywall'

const board = (extra: Partial<FieldMeasurementBoard> = {}): FieldMeasurementBoard => ({
  id: 'b',
  boardType: 'Standard',
  thickness: '5/8',
  width: '48',
  length: '12',
  quantity: '10',
  ...extra,
})
// Goodwill's pre-rock row: 24 × 4×12 fire-taped (1,152 sqft) beside 10 × 4×12 finished (480).
const preRock = board({ id: 'p', quantity: '24', hangOnly: true, fireTaped: true })
const finished = board({ id: 'f' })
const baseLayer = board({ id: 'h', quantity: '5', hangOnly: true })
const measurements = [{ id: 'a', area: 'Topout', notes: '', boards: [preRock, finished, baseLayer] }]

describe('board finish', () => {
  it('reads three finishes from the two stored flags', () => {
    expect(boardFinish(finished)).toBe('finished')
    expect(boardFinish(baseLayer)).toBe('hang_only')
    expect(boardFinish(preRock)).toBe('firetape')
    // fireTaped without hangOnly contradicts itself — finished wins, nothing is paid twice.
    expect(boardFinish(board({ fireTaped: true }))).toBe('finished')
  })

  it('setting a finish drops a stale fireTaped flag', () => {
    expect(withBoardFinish(preRock, 'finished')).not.toHaveProperty('fireTaped')
    expect(withBoardFinish(preRock, 'hang_only')).not.toHaveProperty('fireTaped')
    expect(withBoardFinish(finished, 'firetape')).toMatchObject({ hangOnly: true, fireTaped: true })
  })

  it('fire-taped is hang-only for finish sqft, and counted on its own', () => {
    expect(hangOnlyMeasuredSqft(measurements)).toBe(1152 + 240)
    expect(fireTapedMeasuredSqft(measurements)).toBe(1152)
  })

  it('survives loading a takeoff (the mergeFieldTakeoff allowlist)', () => {
    const merged = mergeFieldTakeoff({ measurements } as unknown as FieldTakeoff)
    expect(fireTapedMeasuredSqft(merged.measurements)).toBe(1152)
  })
})

describe('crew pay sqft', () => {
  it('a measured job carries fire-tape sqft inside hang sqft, outside finish sqft', () => {
    const r = resolveCrewPaySqft({
      legacy: { fieldTakeoff: { totalMeasuredSqft: 1872, measurements } },
      intakeSource: 'quote',
    })
    expect(r).toMatchObject({ sqft: 1872, finishSqft: 480, fireTapeSqft: 1152 })
  })

  it('an unmeasured job takes fire-tape sqft from Firetape Only quote lines', () => {
    const r = resolveCrewPaySqft({
      legacy: {
        quote: {
          version: 3,
          lineItems: [
            { type: 'drywall', quantity: 1000, waste_pct: 10, finish_scope_id: 'firetape_only' },
            { type: 'drywall', quantity: 2000, waste_pct: 10, finish_scope_id: 'level_4' },
          ],
        },
      },
      intakeSource: 'quote',
    })
    expect(r.fireTapeSqft).toBeCloseTo(1100, 6)
    expect(r.finishSqft).toBeCloseTo(2200, 6)
  })
})

describe('fire-tape pay rate', () => {
  it("is what the quote priced fire tape at — Poland's project rate", () => {
    expect(
      jobFireTapeRate({
        version: 3,
        project_finisher_rate: 0.570776,
        lineItems: [{ type: 'drywall', quantity: 3466, waste_pct: 10, finish_scope_id: 'firetape_only' }],
      }),
    ).toBeCloseTo(0.570776, 6)
  })

  it('a line rate wins, and is weighted by sqft', () => {
    expect(
      jobFireTapeRate({
        version: 3,
        project_finisher_rate: 0.5,
        lineItems: [
          { type: 'drywall', quantity: 100, waste_pct: 0, finish_scope_id: 'firetape_only', custom_finisher_rate: 0.2 },
          { type: 'drywall', quantity: 300, waste_pct: 0, finish_scope_id: 'firetape_only' },
        ],
      }),
    ).toBeCloseTo((100 * 0.2 + 300 * 0.5) / 400, 6)
  })

  it('no priced fire-tape line (Goodwill, or a line zeroed) → null, so the catalog rate applies', () => {
    expect(jobFireTapeRate({ version: 3, project_finisher_rate: 0.525, lineItems: [] })).toBeNull()
    expect(
      jobFireTapeRate({
        version: 3,
        lineItems: [{ type: 'drywall', quantity: 811, finish_scope_id: 'firetape_only', custom_finisher_rate: 0 }],
      }),
    ).toBeNull()
  })

  /** The regression: a Firetape Only row used to take the full finisher rate. */
  it('a Firetape Only piece row never takes the full finisher rate', () => {
    const rates = { hangerRate: 0.3, finisherRate: 0.525, prepCleanRate: 0.03 }
    expect(projectLaborRateForPieceKey('firetape_only', rates, null)).toBeNull()
    expect(projectLaborRateForPieceKey('firetape_only', { ...rates, fireTapeRate: 0.57 }, null)).toBe(0.57)
  })
})

describe('fire-tape material', () => {
  const byType = (entries: ReturnType<typeof calculateFieldAccessories>, subtype: string) =>
    Number(entries.find((e) => e.subtype === subtype)?.quantity ?? 0)

  it('tapes fire-taped board like finished board, with a third of the compound', () => {
    // 9,000 hung: 3,000 finished, 6,000 fire-taped → tape on 9,000, compound on 3,000 + 2,000.
    const withFireTape = calculateFieldAccessories(9000, 0, {}, 3000, 6000)
    const tapeLike = calculateFieldAccessories(9000, 0, {}, 9000)
    const compoundLike = calculateFieldAccessories(9000, 0, {}, 5000)
    expect(byType(withFireTape, "500' Paper Tape")).toBe(byType(tapeLike, "500' Paper Tape"))
    expect(byType(withFireTape, 'Easy Sand 90')).toBe(byType(compoundLike, 'Easy Sand 90'))
    expect(byType(withFireTape, 'All Purpose Joint Compound')).toBe(
      byType(compoundLike, 'All Purpose Joint Compound'),
    )
  })

  it('plain hang-only board still gets no tape or compound', () => {
    const hangOnly = calculateFieldAccessories(9000, 0, {}, 3000)
    const finishedOnly = calculateFieldAccessories(3000, 0, {}, 3000)
    expect(byType(hangOnly, "500' Paper Tape")).toBe(byType(finishedOnly, "500' Paper Tape"))
  })
})

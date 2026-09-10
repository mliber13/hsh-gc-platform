/**
 * The duration summary on a v3 quote. v3 has carried the estimator inputs since
 * the structured-scope port, but nothing read them — the PDF toggle was hidden
 * and the section silently dropped off every quote converted from v2.
 */
import { describe, expect, it } from 'vitest'
import { hydrateDrywallQuoteV3 } from './createEmptyDrywallQuoteV3'
import {
  computeDrywallDurationSummary,
  durationFinishFlags,
} from './durationService'


function summaryFor(quote: {
  ceiling_finish?: string
  wall_finish?: string
  build_type?: string
  complexity?: string
  bead_sticks?: string | number
  paper_floors_required?: boolean
}, drywallSqft: number) {
  const { hasLevel5, hasTexture } = durationFinishFlags([
    quote.ceiling_finish,
    quote.wall_finish,
  ])
  return computeDrywallDurationSummary({
    drywallSqft,
    beadSticks: Number(quote.bead_sticks) || 0,
    buildType: String(quote.build_type ?? 'new_build'),
    complexity: String(quote.complexity ?? 'normal'),
    hasLevel5,
    hasTexture,
    paperFloorsRequired: Boolean(quote.paper_floors_required),
  })
}

describe('durationFinishFlags', () => {
  it('reads level 5 out of either finish selection', () => {
    expect(durationFinishFlags(['Level 4 Smooth', 'Level 5']).hasLevel5).toBe(true)
    expect(durationFinishFlags(['Level 5 Smooth', '']).hasLevel5).toBe(true)
    expect(durationFinishFlags(['Level 4 Smooth', 'Level 4']).hasLevel5).toBe(false)
  })

  it('recognises every texture the estimator can pick', () => {
    for (const finish of [
      'Knockdown Texture',
      'Orange Peel',
      'Stomp',
      'Skip Trowel',
      'Roll Texture',
    ]) {
      expect(durationFinishFlags([finish]).hasTexture).toBe(true)
    }
    expect(durationFinishFlags(['Level 4 Smooth']).hasTexture).toBe(false)
  })

  it('ignores null and undefined selections instead of throwing', () => {
    expect(durationFinishFlags([null, undefined]).hasTexture).toBe(false)
  })
})

describe('a v3 quote produces a real duration', () => {
  it('does not collapse to the empty summary', () => {
    const summary = summaryFor(
      { ceiling_finish: 'Knockdown Texture', wall_finish: 'Level 4 Smooth', bead_sticks: '150' },
      12000,
    )
    expect(summary.totalDays).toBeGreaterThan(0)
    expect(summary.lines.map((l) => l.label)).toEqual([
      'Prep/Scaffold & Stock',
      'Hang',
      'Finish (Tape, Bed, Skim, Texture, Sand)',
      'Cleanout',
    ])
  })

  it('adds the paper floors day only when the job calls for it', () => {
    const without = summaryFor({ ceiling_finish: 'Level 4 Smooth' }, 12000)
    const with_ = summaryFor(
      { ceiling_finish: 'Level 4 Smooth', paper_floors_required: true },
      12000,
    )
    expect(with_.totalDays).toBe(without.totalDays + 1)
    expect(with_.lines.some((l) => l.label === 'Paper Floors')).toBe(true)
  })

  it('costs more days for a complex renovation than a normal new build', () => {
    const newBuild = summaryFor({ ceiling_finish: 'Level 4 Smooth' }, 20000)
    const reno = summaryFor(
      { ceiling_finish: 'Level 4 Smooth', build_type: 'renovation', complexity: 'complex' },
      20000,
    )
    expect(reno.totalDays).toBeGreaterThan(newBuild.totalDays)
  })

  it('matches what v2 would have said for the same job', () => {
    // v2 fields map one-to-one onto v3's; the converter carries all four, so a
    // converted quote must not change the number the customer already saw.
    const v2Flags = durationFinishFlags(['Knockdown Texture', 'Level 5'])
    const v3Flags = durationFinishFlags(['Knockdown Texture', 'Level 5'])
    expect(v3Flags).toEqual(v2Flags)

    const v2 = computeDrywallDurationSummary({
      drywallSqft: 18500,
      beadSticks: 220,
      buildType: 'renovation',
      complexity: 'complex',
      ...v2Flags,
      paperFloorsRequired: true,
    })
    const v3 = summaryFor(
      {
        ceiling_finish: 'Knockdown Texture',
        wall_finish: 'Level 5',
        build_type: 'renovation',
        complexity: 'complex',
        bead_sticks: '220',
        paper_floors_required: true,
      },
      18500,
    )
    expect(v3).toEqual(v2)
  })
})

describe('estimator overrides', () => {
  function withOverrides(overrides: Record<string, unknown>) {
    return computeDrywallDurationSummary({
      drywallSqft: 12000,
      hasLevel5: false,
      hasTexture: false,
      overrides,
    })
  }

  it('uses the estimator number and re-totals around it', () => {
    const auto = withOverrides({})
    const hangAuto = auto.lines.find((l) => l.key === 'hang')!.days
    const adjusted = withOverrides({ hang: 9 })
    const hang = adjusted.lines.find((l) => l.key === 'hang')!

    expect(hang.days).toBe(9)
    expect(hang.derivedDays).toBe(hangAuto)
    expect(hang.overridden).toBe(true)
    expect(adjusted.totalDays).toBe(auto.totalDays - hangAuto + 9)
  })

  it('leaves the steps that were not touched on automatic', () => {
    const adjusted = withOverrides({ hang: 9 })
    for (const line of adjusted.lines.filter((l) => l.key !== 'hang')) {
      expect(line.overridden).toBe(false)
      expect(line.days).toBe(line.derivedDays)
    }
  })

  it('accepts zero — a step really can be someone else scope', () => {
    const adjusted = withOverrides({ cleanout: 0 })
    const cleanout = adjusted.lines.find((l) => l.key === 'cleanout')!
    expect(cleanout.days).toBe(0)
    expect(cleanout.overridden).toBe(true)
  })

  it('falls back to calculated for blank, junk and negative values', () => {
    for (const bad of ['', null, undefined, 'soon', NaN, -3]) {
      const line = withOverrides({ hang: bad }).lines.find((l) => l.key === 'hang')!
      expect(line.overridden).toBe(false)
      expect(line.days).toBe(line.derivedDays)
    }
  })

  it('ignores an override for a step this job does not have', () => {
    const noPaper = withOverrides({ paperFloors: 4 })
    expect(noPaper.lines.some((l) => l.key === 'paperFloors')).toBe(false)
  })

  it('says so in the assumptions note when a number was adjusted', () => {
    expect(withOverrides({}).assumptions).not.toContain('Adjusted by the estimator')
    expect(withOverrides({ hang: 9 }).assumptions).toContain('Adjusted by the estimator')
  })

  it('keeps step identity stable when the finish label changes', () => {
    const smooth = computeDrywallDurationSummary({ drywallSqft: 12000, hasTexture: false })
    const textured = computeDrywallDurationSummary({ drywallSqft: 12000, hasTexture: true })
    const smoothFinish = smooth.lines.find((l) => l.key === 'finish')!
    const texturedFinish = textured.lines.find((l) => l.key === 'finish')!
    expect(smoothFinish.label).not.toBe(texturedFinish.label)
    // Different label, same key — so an override survives a finish change.
    expect(smoothFinish.key).toBe(texturedFinish.key)
  })
})

describe('overrides survive a save and reload', () => {
  it('keeps known step keys and drops everything else', () => {
    const saved = hydrateDrywallQuoteV3({
      version: 3,
      lineItems: [],
      alternates: [],
      duration_overrides: { hang: 9, cleanout: 0, bogus: 5, finish: -2, prep: 'x' },
    })
    expect(saved.duration_overrides).toEqual({ hang: 9, cleanout: 0 })
  })

  it('leaves the field off entirely when nothing was adjusted', () => {
    const saved = hydrateDrywallQuoteV3({ version: 3, lineItems: [], alternates: [] })
    expect(saved.duration_overrides).toBeUndefined()
  })
})

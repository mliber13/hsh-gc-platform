/**
 * Which division a person's pay lands in, as at a pay period.
 *
 * This decides where money is attributed on a report that can be regenerated years later, so
 * the edge cases are the point. The case that forced the feature: Richard Petrock moved from
 * HSH Drywall to HSH Contractor on 2026-08-04, and before this existed, flipping his record
 * re-attributed all 36 of his locked periods — $80,478 of 2026 gross — to GC.
 */
import { describe, expect, it } from 'vitest'
import { resolveEffectiveDivisionAllocations } from './hrTeamUtils'

const DRYWALL = [{ division: 'hsh_drywall', pct: 100 }]
const GC = [{ division: 'hsh_contractor', pct: 100 }]
const SPLIT = [
  { division: 'hsh_contractor', pct: 15 },
  { division: 'hsh_drywall', pct: 65 },
  { division: '3d_printing', pct: 20 },
]

/** Rich, as he will be stored once the data fix lands. */
const rich = {
  divisionAllocations: DRYWALL,
  divisionAllocationHistory: [{ effectiveDate: '2026-08-04', allocations: GC }],
}

describe('resolveEffectiveDivisionAllocations', () => {
  it('uses the baseline when there is no history at all', () => {
    expect(resolveEffectiveDivisionAllocations({ divisionAllocations: SPLIT }, '2026-05-01')).toEqual(
      SPLIT,
    )
  })

  it('treats a missing history the same as an empty one', () => {
    expect(
      resolveEffectiveDivisionAllocations(
        { divisionAllocations: DRYWALL, divisionAllocationHistory: null },
        '2026-05-01',
      ),
    ).toEqual(DRYWALL)
  })

  /**
   * The one that matters, and where this deliberately differs from resolveEffectiveSalary:
   * a period BEFORE every dated change falls back to the baseline, not to the earliest
   * entry. Reaching forward to the first change is exactly the retroactive rewrite this
   * exists to stop.
   */
  it('a period before the move keeps the baseline division', () => {
    expect(resolveEffectiveDivisionAllocations(rich, '2026-07-28')).toEqual(DRYWALL)
    expect(resolveEffectiveDivisionAllocations(rich, '2026-01-26')).toEqual(DRYWALL)
  })

  it('a period on the effective date already uses the new division', () => {
    expect(resolveEffectiveDivisionAllocations(rich, '2026-08-04')).toEqual(GC)
  })

  it('a period after the move uses the new division', () => {
    expect(resolveEffectiveDivisionAllocations(rich, '2026-09-28')).toEqual(GC)
  })

  it('picks the latest change that has taken effect, not the newest overall', () => {
    const person = {
      divisionAllocations: DRYWALL,
      divisionAllocationHistory: [
        { effectiveDate: '2026-08-04', allocations: GC },
        { effectiveDate: '2026-11-01', allocations: SPLIT },
      ],
    }
    expect(resolveEffectiveDivisionAllocations(person, '2026-09-01')).toEqual(GC)
    expect(resolveEffectiveDivisionAllocations(person, '2026-11-01')).toEqual(SPLIT)
    expect(resolveEffectiveDivisionAllocations(person, '2026-12-01')).toEqual(SPLIT)
  })

  it('does not care what order history was written in', () => {
    const person = {
      divisionAllocations: DRYWALL,
      divisionAllocationHistory: [
        { effectiveDate: '2026-11-01', allocations: SPLIT },
        { effectiveDate: '2026-08-04', allocations: GC },
      ],
    }
    expect(resolveEffectiveDivisionAllocations(person, '2026-09-01')).toEqual(GC)
  })

  it('ignores malformed entries rather than trusting them', () => {
    const person = {
      divisionAllocations: DRYWALL,
      divisionAllocationHistory: [
        { effectiveDate: '', allocations: GC },
        { effectiveDate: '2026-08-04', allocations: null as never },
        { effectiveDate: '2026-09-01', allocations: GC },
      ],
    }
    expect(resolveEffectiveDivisionAllocations(person, '2026-08-15')).toEqual(DRYWALL)
    expect(resolveEffectiveDivisionAllocations(person, '2026-09-15')).toEqual(GC)
  })

  // splitGrossByDivisions already reads an empty array as "unallocated"; better that than
  // guessing a division for someone nobody has configured.
  it('returns empty when there is nothing to go on', () => {
    expect(resolveEffectiveDivisionAllocations({}, '2026-09-01')).toEqual([])
  })
})

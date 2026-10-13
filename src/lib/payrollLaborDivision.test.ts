/**
 * Payroll lines on a job both divisions work. Shaped on Goodwill Multi-1 (2026-10-13): Rich
 * Petrock moved to HSH Contractor on 2026-08-04, Yuri Garcia is on the drywall roster but
 * framed for the GC, Roberto Galvan hung board.
 */
import { describe, expect, it } from 'vitest'
import { extractAllProjectLaborEntries, type PayPeriodForLabor } from '@/lib/drywall/projectLaborMath'
import { personKey } from '@/lib/payrollMath'
import {
  ALL_DRYWALL_LABOR,
  buildLaborDivisionContext,
  defaultLaborLineDivision,
  laborDivisionFromAllocations,
  laborLineDivision,
} from './payrollLaborDivision'

const team = {
  employees: [
    {
      id: 'rich',
      divisionAllocations: [{ division: 'hsh_drywall', pct: 100 }],
      divisionAllocationHistory: [
        { effectiveDate: '2026-08-04', allocations: [{ division: 'hsh_contractor', pct: 100 }] },
      ],
    },
    { id: 'yuri', divisionAllocations: [{ division: 'hsh_drywall', pct: 100 }] },
    { id: 'roberto', divisionAllocations: [{ division: 'hsh_drywall', pct: 100 }] },
  ],
  contractors1099: [],
}
const projects = [
  { id: 'goodwill', type: 'commercial-renovation' },
  { id: 'kent', type: 'drywall' },
]
const ctx = buildLaborDivisionContext(team, projects, personKey)
const rich = personKey('rich', 'w2')
const yuri = personKey('yuri', 'w2')
const roberto = personKey('roberto', 'w2')

describe('laborDivisionFromAllocations', () => {
  it('HSH Contractor is GC; drywall, ties and empty splits stay drywall', () => {
    expect(laborDivisionFromAllocations([{ division: 'hsh_contractor', pct: 100 }])).toBe('gc')
    expect(laborDivisionFromAllocations([{ division: 'hsh_drywall', pct: 100 }])).toBe('drywall')
    expect(
      laborDivisionFromAllocations([
        { division: 'hsh_contractor', pct: 50 },
        { division: 'hsh_drywall', pct: 50 },
      ]),
    ).toBe('drywall')
    expect(laborDivisionFromAllocations([])).toBe('drywall')
  })
})

describe('defaultLaborLineDivision', () => {
  it('on a shared job, follows the person division dated to the pay period', () => {
    expect(defaultLaborLineDivision('goodwill', rich, '2026-08-03', ctx)).toBe('drywall')
    expect(defaultLaborLineDivision('goodwill', rich, '2026-08-10', ctx)).toBe('gc')
  })

  it('a drywall-type project is always drywall labor, whoever worked it', () => {
    expect(defaultLaborLineDivision('kent', rich, '2026-09-01', ctx)).toBe('drywall')
  })

  it('an unknown project or no job stays drywall, as before', () => {
    expect(defaultLaborLineDivision('deleted-project', rich, '2026-09-01', ctx)).toBe('drywall')
    expect(defaultLaborLineDivision(undefined, rich, '2026-09-01', ctx)).toBe('drywall')
  })
})

describe('laborLineDivision', () => {
  /** Yuri is on the drywall roster, so only a tag can say his Goodwill framing was GC. */
  it('a tag wins over the default', () => {
    expect(laborLineDivision({ jobId: 'goodwill' }, yuri, '2026-08-31', ctx)).toBe('drywall')
    expect(laborLineDivision({ jobId: 'goodwill', division: 'gc' }, yuri, '2026-08-31', ctx)).toBe('gc')
    expect(laborLineDivision({ jobId: 'goodwill', division: 'drywall' }, rich, '2026-09-07', ctx)).toBe('drywall')
  })

  it('a malformed tag is ignored, not trusted', () => {
    expect(laborLineDivision({ jobId: 'goodwill', division: 'GC' }, yuri, '2026-08-31', ctx)).toBe('drywall')
  })
})

describe('extractAllProjectLaborEntries with a shared job', () => {
  const period = (startDate: string, entries: PayPeriodForLabor['entries']): PayPeriodForLabor => ({
    id: startDate,
    startDate,
    endDate: startDate,
    locked: true,
    completedAt: null,
    entries,
  })
  const periods = [
    period('2026-08-31', [
      { personId: 'rich', personType: 'w2', hourEntries: [{ jobId: 'goodwill', hours: 40 }] },
      { personId: 'yuri', personType: 'w2', hourEntries: [{ jobId: 'goodwill', hours: 40, division: 'gc' }] },
      { personId: 'roberto', personType: 'w2', hourEntries: [{ jobId: 'goodwill', hours: 40 }, { jobId: 'kent', hours: 8 }] },
    ]),
  ]
  const rates = { [rich]: 55, [yuri]: 25, [roberto]: 30 }

  it('leaves GC labor out of drywall cost and keeps the drywall crew', () => {
    const byProject = extractAllProjectLaborEntries(periods, null, rates, new Map(), ctx)
    expect(byProject.get('goodwill')?.map((e) => e.personId)).toEqual(['roberto'])
    expect(byProject.get('kent')?.map((e) => e.personId)).toEqual(['roberto'])
  })

  it('keeps the payroll index of each line, so the labor editor still finds it', () => {
    const byProject = extractAllProjectLaborEntries(periods, null, rates, new Map(), ctx)
    expect(byProject.get('kent')?.[0].entryIndex).toBe(1)
  })

  it('with no shared projects every untagged line is drywall; a GC tag still holds', () => {
    const byProject = extractAllProjectLaborEntries(periods, null, rates, new Map(), ALL_DRYWALL_LABOR)
    expect(byProject.get('goodwill')?.map((e) => e.personId)).toEqual(['rich', 'roberto'])
  })
})

/**
 * GC actuals read the 'gc' half of the same lines drywall cost reads the 'drywall' half of
 * (gcPayrollLaborService). Every line must land on exactly one side.
 */
describe('drywall and GC partition payroll', () => {
  const periods: PayPeriodForLabor[] = [
    {
      id: 'p1',
      startDate: '2026-08-31',
      endDate: '2026-09-06',
      locked: true,
      completedAt: null,
      entries: [
        { personId: 'rich', personType: 'w2', hourEntries: [{ jobId: 'goodwill', hours: 40 }] },
        { personId: 'yuri', personType: 'w2', hourEntries: [{ jobId: 'goodwill', hours: 40, division: 'gc' }] },
        {
          personId: 'roberto',
          personType: 'w2',
          hourEntries: [{ jobId: 'goodwill', hours: 30 }, { jobId: 'kent', hours: 10 }],
          pieceEntries: [{ jobId: 'goodwill', amount: 500, netAmount: 500 }],
        },
      ],
    },
  ]
  const rates = { [rich]: 55, [yuri]: 25, [roberto]: 30 }
  const total = (m: Map<string, { amount: number }[]>, id: string) =>
    (m.get(id) ?? []).reduce((s, e) => s + e.amount, 0)
  const everything = { projectTypeById: new Map<string, string | null>(), personDivisionAt: () => 'drywall' as const }

  it('drywall + GC equals all payroll on every project', () => {
    const drywall = extractAllProjectLaborEntries(periods, null, rates, new Map(), ctx, 'drywall')
    const gc = extractAllProjectLaborEntries(periods, null, rates, new Map(), ctx, 'gc')
    // Untagged, unknown-project context counts every line, but still honours Yuri's GC tag —
    // so add the GC half back to get all of payroll.
    const all = extractAllProjectLaborEntries(periods, null, rates, new Map(), everything, 'drywall')
    const allGc = extractAllProjectLaborEntries(periods, null, rates, new Map(), everything, 'gc')
    for (const id of ['goodwill', 'kent']) {
      expect(total(drywall, id) + total(gc, id)).toBeCloseTo(total(all, id) + total(allGc, id), 6)
    }
    expect(total(gc, 'goodwill')).toBe(40 * 55 + 40 * 25)
    expect(total(drywall, 'goodwill')).toBe(30 * 30 + 500)
  })

  it('flipping a tag moves the dollars, it does not add them', () => {
    const flipped = periods.map((p) => ({
      ...p,
      entries: p.entries.map((e) =>
        e.personId === 'roberto'
          ? { ...e, hourEntries: e.hourEntries?.map((h, i) => (i === 0 ? { ...h, division: 'gc' as const } : h)) }
          : e,
      ),
    }))
    const before = extractAllProjectLaborEntries(periods, null, rates, new Map(), ctx, 'gc')
    const after = extractAllProjectLaborEntries(flipped, null, rates, new Map(), ctx, 'gc')
    const dwBefore = extractAllProjectLaborEntries(periods, null, rates, new Map(), ctx, 'drywall')
    const dwAfter = extractAllProjectLaborEntries(flipped, null, rates, new Map(), ctx, 'drywall')
    expect(total(after, 'goodwill') - total(before, 'goodwill')).toBe(30 * 30)
    expect(total(dwBefore, 'goodwill') - total(dwAfter, 'goodwill')).toBe(30 * 30)
  })
})

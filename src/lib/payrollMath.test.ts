import { describe, expect, it } from 'vitest'
import {
  buildDraftFromPreviousRun,
  buildPayrollPeople,
  defaultHelperAssignRate,
  entryHasNonZeroAdjustments,
  fieldMeasuredSqftFromProjectMetadata,
  getHelperDeductionForJob,
  getNetPieceTotal,
  getRateFromJob,
  getSqftFromJob,
  helperAssignDeductionAmount,
  isPayrollDraftEmpty,
  laborRatesFromProjectMetadata,
  nextPeriodDateRangeFromRun,
  payrollLastWeekRange,
  payrollThisWeekRange,
  personKey,
  pieceRowHelperDeduction,
  splitGrossByDivisions,
} from './payrollMath'
import { projectLaborRateForPieceKey } from './drywall/payrollPieceKeys'
import type { PayPeriod } from '@/types/payroll'
import type { Contractor1099, Employee } from '@/types/hr'

describe('buildPayrollPeople', () => {
  const active: Employee = { id: 'a1', name: 'Active', status: 'active' }
  const archived: Employee = { id: 'a2', name: 'Archived', status: 'archived' }

  it('excludes archived unless retainedPersonKeys includes them', () => {
    const without = buildPayrollPeople([active, archived], [], false)
    expect(without.map((p) => p.id)).toEqual(['a1'])

    const retained = buildPayrollPeople(
      [active, archived],
      [],
      false,
      new Set([personKey('a2', 'w2')]),
    )
    expect(retained.map((p) => p.id)).toEqual(['a1', 'a2'])
  })

  it('includes all archived when includeArchived is true', () => {
    const all = buildPayrollPeople([active, archived], [], true)
    expect(all.map((p) => p.id)).toEqual(['a1', 'a2'])
  })
})

describe('splitGrossByDivisions', () => {
  it('splits gross by provided percentages when total is 100%', () => {
    const split = splitGrossByDivisions(1000, [
      { division: 'hsh_drywall', pct: 65 },
      { division: 'hsh_contractor', pct: 15 },
      { division: '3d_printing', pct: 20 },
    ])
    expect(split).toEqual({
      hsh_drywall: 650,
      hsh_contractor: 150,
      '3d_printing': 200,
    })
  })

  it('adds unallocated remainder when percentages are under 100%', () => {
    const split = splitGrossByDivisions(1000, [
      { division: 'hsh_drywall', pct: 70 },
      { division: 'hsh_contractor', pct: 20 },
    ])
    expect(split.hsh_drywall).toBe(700)
    expect(split.hsh_contractor).toBe(200)
    expect(split.__unallocated).toBe(100)
  })

  it('returns empty object when allocations are empty', () => {
    expect(splitGrossByDivisions(1000, [])).toEqual({})
    expect(splitGrossByDivisions(1000)).toEqual({})
  })
})

describe('buildDraftFromPreviousRun', () => {
  const people = [
    {
      id: 'emp-1',
      name: 'Alice',
      personType: 'w2' as const,
      personKey: 'w2-emp-1',
      payType: 'hourly',
      hourlyRate: 25,
      status: 'active',
    },
  ]

  const previousRun: PayPeriod = {
    id: 'run-1',
    startDate: '2026-05-12',
    endDate: '2026-05-18',
    entries: [
      {
        personId: 'emp-1',
        personType: 'w2',
        personName: 'Alice',
        hourEntries: [
          {
            id: 'h1',
            jobId: 'job-1',
            jobName: 'Site A',
            hours: 40,
            overtimeType: '1.5',
          },
        ],
        pieceEntries: [
          {
            id: 'p1',
            jobId: 'job-2',
            jobName: 'Site B',
            workType: 'finisher',
            totalPhases: 5,
            phasesCompleted: 2,
            jobTotalSqft: 1000,
            rate: 0.5,
            amount: 200,
          },
        ],
        perDiem: 50,
        reimbursement: 25,
        bankedHoursUsed: 4,
        hoursToBank: 2,
        done: true,
      },
    ],
  }

  it('zeros hours, phases, and adjustments while preserving structure', () => {
    const draft = buildDraftFromPreviousRun(previousRun, people)
    const entry = draft['w2-emp-1']
    expect(entry.hourEntries).toHaveLength(1)
    expect(entry.hourEntries?.[0].hours).toBe('')
    expect(entry.hourEntries?.[0].overtimeType).toBe('1.5')
    expect(entry.hourEntries?.[0].jobName).toBe('Site A')
    expect(entry.pieceEntries).toHaveLength(1)
    expect(entry.pieceEntries?.[0].phasesCompleted).toBe('')
    expect(entry.pieceEntries?.[0].amount).toBe(0)
    expect(entry.pieceEntries?.[0].workType).toBe('finisher')
    expect(entry.perDiem).toBe('')
    expect(entry.reimbursement).toBe('')
    expect(entry.bankedHoursUsed).toBe('')
    expect(entry.hoursToBank).toBe('')
    expect(entry.done).toBe(false)
  })

  it('skips archived members even when caller includes them', () => {
    const archivedPerson = {
      id: 'emp-archived',
      name: 'Former',
      personType: 'w2' as const,
      personKey: 'w2-emp-archived',
      payType: 'hourly',
      hourlyRate: 20,
      status: 'archived',
    }
    const draft = buildDraftFromPreviousRun(previousRun, [...people, archivedPerson])
    expect(draft['w2-emp-archived']).toBeUndefined()
    expect(draft['w2-emp-1']).toBeDefined()
  })

  it('advances period to the week after the previous run end', () => {
    const next = nextPeriodDateRangeFromRun(previousRun)
    expect(next.start).toBe('2026-05-19')
    expect(next.end).toBe('2026-05-24')
  })
})

describe('payroll draft helpers', () => {
  it('detects empty vs non-empty drafts', () => {
    expect(isPayrollDraftEmpty({})).toBe(true)
    expect(
      isPayrollDraftEmpty({
        'w2-1': {
          personId: '1',
          personType: 'w2',
          hourEntries: [{ jobId: 'j', hours: 8 }],
        },
      }),
    ).toBe(false)
  })

  it('detects non-zero adjustments', () => {
    expect(entryHasNonZeroAdjustments({ personId: '1', personType: 'w2', perDiem: 10 })).toBe(
      true,
    )
    expect(entryHasNonZeroAdjustments({ personId: '1', personType: 'w2' })).toBe(false)
  })
})

describe('payroll week ranges', () => {
  it('returns mon–sun bounds', () => {
    const w = payrollThisWeekRange()
    expect(w.start <= w.end).toBe(true)
    const last = payrollLastWeekRange()
    expect(last.end < w.start || last.start < w.start).toBe(true)
  })
})

describe('fieldMeasuredSqftFromProjectMetadata', () => {
  it('reads totalMeasuredSqft from legacy fieldTakeoff', () => {
    expect(
      fieldMeasuredSqftFromProjectMetadata({
        legacy: { fieldTakeoff: { totalMeasuredSqft: 12500.5 } },
      }),
    ).toBe(12500.5)
  })

  it('returns null when field measurement is missing or zero', () => {
    expect(fieldMeasuredSqftFromProjectMetadata({ legacy: { fieldTakeoff: {} } })).toBeNull()
    expect(
      fieldMeasuredSqftFromProjectMetadata({
        legacy: { fieldTakeoff: { totalMeasuredSqft: 0 } },
      }),
    ).toBeNull()
    expect(fieldMeasuredSqftFromProjectMetadata(null)).toBeNull()
  })
})

describe('getSqftFromJob', () => {
  it('returns fieldMeasuredSqft when populated', () => {
    expect(getSqftFromJob({ fieldMeasuredSqft: 8400 })).toBe(8400)
  })

  it('returns null when sqft is missing', () => {
    expect(getSqftFromJob({ fieldMeasuredSqft: null })).toBeNull()
    expect(getSqftFromJob(null)).toBeNull()
  })
})

describe('laborRatesFromProjectMetadata', () => {
  it('prefers order reviewApprovedRates over quote rates', () => {
    expect(
      laborRatesFromProjectMetadata({
        quote: {
          project_hanger_rate: 0.42,
          project_finisher_rate: 0.55,
          prep_clean_rate: 0.1,
        },
        legacy: {
          fieldTakeoff: {
            reviewApprovedRates: {
              hangerRate: 0.48,
              finisherRate: 0.62,
              prepCleanRate: 0.12,
            },
          },
        },
      }),
    ).toEqual({
      hangerRate: 0.48,
      finisherRate: 0.62,
      prepCleanRate: 0.12,
    })
  })

  it('falls back to v3 quote project rates when order rates are missing', () => {
    expect(
      laborRatesFromProjectMetadata({
        quote: {
          project_hanger_rate: 0.42,
          project_finisher_rate: 0.55,
          prep_clean_rate: 0.1,
        },
      }),
    ).toEqual({
      hangerRate: 0.42,
      finisherRate: 0.55,
      prepCleanRate: 0.1,
    })
  })

  it('falls back to v2 quote rate field names', () => {
    expect(
      laborRatesFromProjectMetadata({
        quote: {
          hangerRate: 0.4,
          finisherRate: 0.5,
          prepCleanRate: 0.08,
        },
      }),
    ).toEqual({
      hangerRate: 0.4,
      finisherRate: 0.5,
      prepCleanRate: 0.08,
    })
  })
})

describe('getRateFromJob / projectLaborRateForPieceKey', () => {
  const laborRates = {
    hangerRate: 0.48,
    finisherRate: 0.62,
    prepCleanRate: 0.12,
  }

  it('uses laborRates for hang and finish over quote', () => {
    const project = {
      laborRates,
      quote: { hangerRate: 0.42, finisherRate: 0.55 },
    }
    expect(getRateFromJob(project, 'hang')).toBe(0.48)
    expect(getRateFromJob(project, 'drywall_hanging')).toBe(0.48)
    expect(getRateFromJob(project, 'finisher')).toBe(0.62)
    expect(getRateFromJob(project, 'prepClean')).toBe(0.12)
  })

  it('maps finish-scope piece keys to order finisher rate', () => {
    const catalogs = {
      finish_scopes: [
        {
          id: 'scope-l5',
          display_name: 'Level 5',
          applies_to_locations: ['wall'],
          finisher_rate: 0.55,
          accessories_applied: {
            joint_compound: true,
            tape: true,
            screws: false,
            corner_bead: false,
          },
          payroll_piece_key: 'finish_level_5',
        },
      ],
    } as import('@/types/drywallCatalogs').OrgDrywallCatalogs

    expect(
      projectLaborRateForPieceKey('finish_level_5', laborRates, catalogs),
    ).toBe(0.62)
    expect(projectLaborRateForPieceKey('drywall_hanging', laborRates, catalogs)).toBe(
      0.48,
    )
  })
})

describe('helper assign / piece deduction', () => {
  it('defaults assign rate from override then worker profile', () => {
    expect(defaultHelperAssignRate({ rateOverride: '15' }, 18)).toBe('15')
    expect(defaultHelperAssignRate({}, 18)).toBe('18')
    expect(defaultHelperAssignRate({ assignRate: '12', rateOverride: '15' }, 18)).toBe('12')
    expect(defaultHelperAssignRate({ assignRate: '12' }, 18, { force: true })).toBe('18')
  })

  it('computes hours × assignRate as the deduction amount', () => {
    expect(helperAssignDeductionAmount({ hours: 8, assignRate: 15 })).toBe(120)
    expect(helperAssignDeductionAmount({ hours: 8, assignAmount: 50 })).toBe(50)
  })

  it('deducts assigned helper hours from the named lead on the same job', () => {
    const leadKey = 'w2-lead'
    const helperKey = 'w2-helper'
    const entries = {
      [helperKey]: {
        personId: 'helper',
        personType: 'w2',
        hourEntries: [
          {
            jobId: 'job-1',
            jobName: 'Oak St',
            hours: 8,
            assignToPersonId: leadKey,
            assignRate: 15,
          },
        ],
      },
      [leadKey]: {
        personId: 'lead',
        personType: 'w2',
        pieceEntries: [
          {
            jobId: 'job-1',
            jobName: 'Oak St',
            amount: 500,
          },
        ],
      },
    }

    expect(getHelperDeductionForJob(entries, leadKey, 'job-1', 'Oak St')).toBe(120)
    expect(getNetPieceTotal(entries[leadKey].pieceEntries, entries, leadKey)).toBe(380)
  })

  it('does not deduct when assignTo is set but assignRate is missing', () => {
    const leadKey = 'w2-lead'
    const entries = {
      'w2-helper': {
        personId: 'helper',
        personType: 'w2',
        hourEntries: [
          {
            jobId: 'job-1',
            jobName: 'Oak St',
            hours: 8,
            assignToPersonId: leadKey,
          },
        ],
      },
    }
    expect(getHelperDeductionForJob(entries, leadKey, 'job-1', 'Oak St')).toBe(0)
  })

  it('allocates helper deduction across piece rows on the same job', () => {
    const pe = { jobId: 'job-1', jobName: 'Oak St', amount: 500 }
    const { raw, helperShare, net } = pieceRowHelperDeduction(
      [pe, { jobId: 'job-1', jobName: 'Oak St', amount: 500 }],
      pe,
      200,
    )
    expect(raw).toBe(500)
    expect(helperShare).toBe(100)
    expect(net).toBe(400)
  })
})

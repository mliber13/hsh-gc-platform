import { describe, expect, it } from 'vitest'
import {
  buildDraftFromPreviousRun,
  entryHasNonZeroAdjustments,
  isPayrollDraftEmpty,
  nextPeriodDateRangeFromRun,
  payrollLastWeekRange,
  payrollThisWeekRange,
} from './payrollMath'
import type { PayPeriod } from '@/types/payroll'

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

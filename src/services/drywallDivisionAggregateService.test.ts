import { describe, expect, it } from 'vitest'
import { LABOR_TAX_RATE } from '@/lib/drywall/calculations/quantityUtils'
import {
  aggregateDivisionExecutionRollUp,
  buildDivisionExecutionRollUp,
  buildDivisionMarginJob,
  sortDivisionJobsWorstMarginFirst,
} from '@/services/drywallDivisionAggregateService'
import type { BidSnapshot } from '@/types/drywall'

function bidSnapshot(total: number): BidSnapshot {
  return {
    total,
    at: '2026-01-01T00:00:00.000Z',
    payload: {
      routineSubtotal: total,
      cleanupTotal: 0,
      overhead: 0,
      profit: 0,
      salesTax: 0,
      bidTotal: total,
      lineItems: [],
      alternates: [],
    },
  }
}

describe('buildDivisionMarginJob', () => {
  it('includes W2 burden in actualLabor', () => {
    const job = buildDivisionMarginJob({
      projectId: 'p1',
      projectName: 'Site A',
      status: 'production-complete',
      bidSnapshot: bidSnapshot(10_000),
      laborEntries: [
        {
          payPeriodId: 'pp-1',
          periodStart: '2026-05-01',
          periodEnd: '2026-05-07',
          periodLocked: true,
          periodCompletedAt: null,
          personId: 'w2-1',
          personType: 'w2',
          source: 'piece',
          amount: 400,
          category: 'hanger',
        },
      ],
      materialEntries: [],
      subEntries: [],
    })

    expect(job.actualLabor).toBeCloseTo(400 * (1 + LABOR_TAX_RATE), 5)
    expect(job.totalActual).toBe(job.actualLabor)
  })
})

describe('aggregateDivisionExecutionRollUp', () => {
  it('aggregates completed jobs only and excludes in-progress from totals', () => {
    const jobs = [
      buildDivisionMarginJob({
        projectId: 'done',
        projectName: 'Done Job',
        status: 'closed',
        bidSnapshot: bidSnapshot(10_000),
        laborEntries: [],
        materialEntries: [{ id: '1', date: '2026-01-01', description: 'Board', vendor: null, amount: 2_000 }],
        subEntries: [],
      }),
      buildDivisionMarginJob({
        projectId: 'running',
        projectName: 'Running Job',
        status: 'production',
        bidSnapshot: bidSnapshot(20_000),
        laborEntries: [
          {
            payPeriodId: 'pp-1',
            periodStart: '2026-05-01',
            periodEnd: '2026-05-07',
            periodLocked: false,
            periodCompletedAt: null,
            personId: 'c-1',
            personType: '1099',
            source: 'piece',
            amount: 5_000,
            category: 'hanger',
          },
        ],
        materialEntries: [],
        subEntries: [],
      }),
    ]

    const agg = aggregateDivisionExecutionRollUp(jobs, '2026-06-01T00:00:00.000Z')

    expect(agg.completedCount).toBe(1)
    expect(agg.inProgressCount).toBe(1)
    expect(agg.totalBidCompleted).toBe(10_000)
    expect(agg.totalActualCompleted).toBe(2_000)
    expect(agg.aggregateMarginUsd).toBe(8_000)
    expect(agg.aggregateMarginPct).toBeCloseTo(0.8, 5)
    expect(agg.aggregateMarginColor).toBe('green')
  })
})

describe('sortDivisionJobsWorstMarginFirst', () => {
  it('sorts by marginPct ascending with nulls last', () => {
    const jobs = [
      buildDivisionMarginJob({
        projectId: 'a',
        projectName: 'High',
        status: 'closed',
        bidSnapshot: bidSnapshot(10_000),
        laborEntries: [],
        materialEntries: [{ id: '1', date: '2026-01-01', description: 'x', vendor: null, amount: 1_000 }],
        subEntries: [],
      }),
      buildDivisionMarginJob({
        projectId: 'b',
        projectName: 'Low',
        status: 'closed',
        bidSnapshot: bidSnapshot(10_000),
        laborEntries: [],
        materialEntries: [{ id: '2', date: '2026-01-01', description: 'x', vendor: null, amount: 9_000 }],
        subEntries: [],
      }),
      buildDivisionMarginJob({
        projectId: 'c',
        projectName: 'No bid',
        status: 'closed',
        bidSnapshot: null,
        laborEntries: [],
        materialEntries: [],
        subEntries: [],
      }),
    ]

    const sorted = sortDivisionJobsWorstMarginFirst(jobs)
    expect(sorted[0].projectId).toBe('b')
    expect(sorted[1].projectId).toBe('a')
    expect(sorted[2].projectId).toBe('c')
  })
})

describe('buildDivisionExecutionRollUp', () => {
  it('returns worst-margin-first jobs with aggregate metadata', () => {
    const rollUp = buildDivisionExecutionRollUp(
      [
        buildDivisionMarginJob({
          projectId: 'good',
          projectName: 'Good',
          status: 'production-complete',
          bidSnapshot: bidSnapshot(10_000),
          laborEntries: [],
          materialEntries: [{ id: '1', date: '2026-01-01', description: 'x', vendor: null, amount: 5_000 }],
          subEntries: [],
        }),
        buildDivisionMarginJob({
          projectId: 'bad',
          projectName: 'Bad',
          status: 'closed',
          bidSnapshot: bidSnapshot(10_000),
          laborEntries: [],
          materialEntries: [{ id: '2', date: '2026-01-01', description: 'x', vendor: null, amount: 9_500 }],
          subEntries: [],
        }),
      ],
      '2026-06-01T00:00:00.000Z',
    )

    expect(rollUp.jobs[0].projectId).toBe('bad')
    expect(rollUp.jobs[1].projectId).toBe('good')
    expect(rollUp.completedCount).toBe(2)
  })
})

import { describe, expect, it } from 'vitest'
import { LABOR_TAX_RATE } from '@/lib/drywall/calculations/quantityUtils'
import {
  aggregateDivisionExecutionRollUp,
  aggregateDivisionLaborPerformance,
  aggregateEstimatingAccuracy,
  buildDivisionExecutionJob,
  buildDivisionExecutionRollUp,
  buildDivisionMarginJob,
  computeEstimatingVariancePct,
  computeLaborEfficiencyPct,
  estimatingAccuracyColor,
  laborEfficiencyColor,
  scopeEstimatingAccuracyJobs,
  sortDivisionJobsWorstMarginFirst,
} from '@/services/drywallDivisionAggregateService'
import type { BidSnapshot } from '@/types/drywall'
import type { DivisionExecutionJob } from '@/services/drywallDivisionAggregateService'

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

describe('buildDivisionExecutionJob', () => {
  it('includes labor-by-trade and estimate fields', () => {
    const job = buildDivisionExecutionJob({
      projectId: 'p1',
      projectName: 'Site A',
      status: 'production',
      bidSnapshot: bidSnapshot(10_000),
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
          amount: 1_000,
          category: 'hanger',
        },
        {
          payPeriodId: 'pp-1',
          periodStart: '2026-05-01',
          periodEnd: '2026-05-07',
          periodLocked: false,
          periodCompletedAt: null,
          personId: 'c-2',
          personType: '1099',
          source: 'hour',
          amount: 200,
          category: 'hourly',
        },
      ],
      materialEntries: [],
      subEntries: [],
      estLabor: 5_000,
      estLaborByTrade: { hanger: 3_000, finisher: 2_000, components: 0, prepClean: 0 },
      estMaterial: 8_000,
    })

    expect(job.actualLaborByTrade.hanger).toBe(1_000)
    expect(job.actualLaborByTrade.hourly).toBe(200)
    expect(job.estLabor).toBe(5_000)
    expect(job.estLaborByTrade.hanger).toBe(3_000)
    expect(job.estMaterial).toBe(8_000)
  })
})

describe('aggregateDivisionLaborPerformance', () => {
  it('aggregates trade rows and computes efficiency as est ÷ actual × 100', () => {
    const jobs = [
      buildDivisionExecutionJob({
        projectId: 'a',
        projectName: 'A',
        status: 'production-complete',
        bidSnapshot: bidSnapshot(10_000),
        laborEntries: [],
        materialEntries: [],
        subEntries: [],
        estLabor: 10_000,
        estLaborByTrade: { hanger: 6_000, finisher: 4_000, components: 0, prepClean: 0 },
      }),
      buildDivisionExecutionJob({
        projectId: 'b',
        projectName: 'B',
        status: 'closed',
        bidSnapshot: bidSnapshot(10_000),
        laborEntries: [
          {
            payPeriodId: 'pp-1',
            periodStart: '2026-05-01',
            periodEnd: '2026-05-07',
            periodLocked: true,
            periodCompletedAt: null,
            personId: 'c-1',
            personType: '1099',
            source: 'piece',
            amount: 5_000,
            category: 'hanger',
          },
          {
            payPeriodId: 'pp-1',
            periodStart: '2026-05-01',
            periodEnd: '2026-05-07',
            periodLocked: true,
            periodCompletedAt: null,
            personId: 'c-2',
            personType: '1099',
            source: 'piece',
            amount: 5_000,
            category: 'finisher',
          },
          {
            payPeriodId: 'pp-1',
            periodStart: '2026-05-01',
            periodEnd: '2026-05-07',
            periodLocked: true,
            periodCompletedAt: null,
            personId: 'c-3',
            personType: '1099',
            source: 'hour',
            amount: 500,
            category: 'hourly',
          },
        ],
        materialEntries: [],
        subEntries: [],
        estLabor: 8_000,
        estLaborByTrade: { hanger: 5_000, finisher: 3_000, components: 0, prepClean: 0 },
      }),
    ]

    const perf = aggregateDivisionLaborPerformance(jobs)

    expect(perf.totalEstLabor).toBe(18_000)
    expect(perf.totalActualLabor).toBe(10_500)
    expect(perf.overallEfficiencyPct).toBeCloseTo((18_000 / 10_500) * 100, 5)

    const hanger = perf.tradeRows.find((r) => r.trade === 'hanger')!
    expect(hanger.estimated).toBe(11_000)
    expect(hanger.actual).toBe(5_000)
    expect(hanger.efficiencyPct).toBeCloseTo(220, 5)
    expect(hanger.varianceUsd).toBe(-6_000)
    expect(hanger.efficiencyColor).toBe('green')

    const finisher = perf.tradeRows.find((r) => r.trade === 'finisher')!
    expect(finisher.efficiencyPct).toBeCloseTo(140, 5)

    expect(perf.unmappedActual.hourly).toBe(500)
    expect(perf.unmappedActual.total).toBe(500)
  })
})

describe('computeLaborEfficiencyPct', () => {
  it('returns null when actual is zero', () => {
    expect(computeLaborEfficiencyPct(1_000, 0)).toBeNull()
  })

  it('colors efficiency thresholds', () => {
    expect(laborEfficiencyColor(105)).toBe('green')
    expect(laborEfficiencyColor(95)).toBe('yellow')
    expect(laborEfficiencyColor(80)).toBe('red')
  })
})

describe('aggregateEstimatingAccuracy', () => {
  const now = new Date('2026-06-15T12:00:00.000Z')

  function completedJob(
    overrides: Partial<DivisionExecutionJob> & {
      projectId: string
      completedAt: string
    },
  ): DivisionExecutionJob {
    const {
      projectId,
      completedAt,
      projectName,
      status,
      estMaterial,
      estLabor,
      estLaborByTrade,
      ...fieldOverrides
    } = overrides

    const base = buildDivisionExecutionJob({
      projectId,
      projectName: projectName ?? projectId,
      status: status ?? 'closed',
      bidSnapshot: bidSnapshot(10_000),
      laborEntries: [],
      materialEntries: [],
      subEntries: [],
      completedAt,
      estMaterial: estMaterial ?? 4_000,
      estLabor: estLabor ?? 6_000,
      estLaborByTrade:
        estLaborByTrade ?? {
          hanger: 3_000,
          finisher: 2_000,
          components: 500,
          prepClean: 500,
        },
    })

    return { ...base, ...fieldOverrides, projectId, completedAt }
  }

  it('scopes to completed jobs with estimate in the last 12 months', () => {
    const jobs = [
      completedJob({
        projectId: 'ok',
        completedAt: '2026-05-01T00:00:00.000Z',
        actualMaterial: 4_500,
        actualLabor: 6_000,
      }),
      completedJob({
        projectId: 'running',
        completedAt: '2026-05-01T00:00:00.000Z',
        status: 'production',
      }),
      completedJob({
        projectId: 'stale',
        completedAt: '2024-01-01T00:00:00.000Z',
      }),
      completedJob({
        projectId: 'no-est',
        completedAt: '2026-04-01T00:00:00.000Z',
        estMaterial: 0,
        estLabor: 0,
        estLaborByTrade: { hanger: 0, finisher: 0, components: 0, prepClean: 0 },
      }),
    ]

    const scoped = scopeEstimatingAccuracyJobs(jobs, now)
    expect(scoped).toHaveLength(1)
    expect(scoped[0].projectId).toBe('ok')
  })

  it('aggregates overall, by-bucket, and by-month variance', () => {
    const jobs = [
      completedJob({
        projectId: 'may',
        completedAt: '2026-05-10T00:00:00.000Z',
        actualMaterial: 5_000,
        actualLabor: 7_000,
        estMaterial: 4_000,
        estLabor: 6_000,
        estLaborByTrade: { hanger: 3_000, finisher: 2_000, components: 500, prepClean: 500 },
        actualLaborByTrade: {
          hanger: 4_000,
          finisher: 2_500,
          components: 400,
          prepClean: 100,
          legacy: 0,
          hourly: 0,
          other: 0,
        },
      }),
      completedJob({
        projectId: 'apr',
        projectName: 'April Job',
        completedAt: '2026-04-15T00:00:00.000Z',
        actualMaterial: 3_000,
        actualLabor: 5_000,
        estMaterial: 4_000,
        estLabor: 6_000,
        estLaborByTrade: { hanger: 3_000, finisher: 2_000, components: 500, prepClean: 500 },
      }),
    ]

    const accuracy = aggregateEstimatingAccuracy(jobs, now)

    expect(accuracy.jobCount).toBe(2)
    expect(accuracy.overallVariancePct).toBeCloseTo(
      (20_000 - 20_000) / 20_000,
      5,
    )

    const material = accuracy.byBucket.find((b) => b.key === 'material')!
    expect(material.est).toBe(8_000)
    expect(material.actual).toBe(8_000)
    expect(material.variancePct).toBeCloseTo(0, 5)

    const mayMonth = accuracy.byMonth.find((m) => m.month === '2026-05')!
    expect(mayMonth.jobCount).toBe(1)
    expect(mayMonth.variancePct).toBeCloseTo((12_000 - 10_000) / 10_000, 5)

    const aprMonth = accuracy.byMonth.find((m) => m.month === '2026-04')!
    expect(aprMonth.jobCount).toBe(1)
    expect(aprMonth.variancePct).toBeCloseTo((8_000 - 10_000) / 10_000, 5)

    expect(accuracy.mostOff.length).toBeGreaterThan(0)
    expect(accuracy.mostOff[0].projectId).toBe('may')
  })

  it('computes variance ratio with positive = over estimate', () => {
    expect(computeEstimatingVariancePct(10_000, 11_200)).toBeCloseTo(0.12, 5)
    expect(estimatingAccuracyColor(0.12)).toBe('yellow')
    expect(estimatingAccuracyColor(0.03)).toBe('green')
    expect(estimatingAccuracyColor(-0.2)).toBe('red')
  })
})

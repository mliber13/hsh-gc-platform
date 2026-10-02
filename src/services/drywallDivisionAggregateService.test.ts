import { describe, expect, it } from 'vitest'
import { LABOR_TAX_RATE } from '@/lib/drywall/calculations/quantityUtils'
import {
  aggregateDivisionExecutionRollUp,
  aggregateDivisionLaborPerformance,
  aggregateEstimatingAccuracy,
  buildDivisionExecutionJob,
  buildDivisionExecutionRollUp,
  computeEstimatingVariancePct,
  computeLaborEfficiencyPct,
  estimatingAccuracyColor,
  laborEfficiencyColor,
  aggregateTakeoffAccuracy,
  scopeEstimatingAccuracyJobs,
  scopeTakeoffAccuracyJobs,
  TAKEOFF_ACCURACY_MIN_SQFT,
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

// buildDivisionMarginJob was a one-line alias for buildDivisionExecutionJob with no caller
// outside this file, so it went with the rest of the dead code; the fixtures call the real
// function now.
describe('buildDivisionExecutionJob margin fields', () => {
  it('includes W2 burden in actualLabor', () => {
    const job = buildDivisionExecutionJob({
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
          entryIndex: 0,
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
      buildDivisionExecutionJob({
        projectId: 'done',
        projectName: 'Done Job',
        status: 'closed',
        bidSnapshot: bidSnapshot(10_000),
        laborEntries: [],
        materialEntries: [{ id: '1', date: '2026-01-01', description: 'Board', vendor: null, amount: 2_000 }],
        subEntries: [],
      }),
      buildDivisionExecutionJob({
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
          entryIndex: 0,
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
      buildDivisionExecutionJob({
        projectId: 'a',
        projectName: 'High',
        status: 'closed',
        bidSnapshot: bidSnapshot(10_000),
        laborEntries: [],
        materialEntries: [{ id: '1', date: '2026-01-01', description: 'x', vendor: null, amount: 1_000 }],
        subEntries: [],
      }),
      buildDivisionExecutionJob({
        projectId: 'b',
        projectName: 'Low',
        status: 'closed',
        bidSnapshot: bidSnapshot(10_000),
        laborEntries: [],
        materialEntries: [{ id: '2', date: '2026-01-01', description: 'x', vendor: null, amount: 9_000 }],
        subEntries: [],
      }),
      buildDivisionExecutionJob({
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
        buildDivisionExecutionJob({
          projectId: 'good',
          projectName: 'Good',
          status: 'production-complete',
          bidSnapshot: bidSnapshot(10_000),
          laborEntries: [],
          materialEntries: [{ id: '1', date: '2026-01-01', description: 'x', vendor: null, amount: 5_000 }],
          subEntries: [],
        }),
        buildDivisionExecutionJob({
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
          entryIndex: 0,
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
          entryIndex: 0,
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
  it('aggregates completed jobs only and computes efficiency as est ÷ actual × 100', () => {
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
          entryIndex: 0,
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
          entryIndex: 0,
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
          entryIndex: 0,
          },
        ],
        materialEntries: [],
        subEntries: [],
        estLabor: 8_000,
        estLaborByTrade: { hanger: 5_000, finisher: 3_000, components: 0, prepClean: 0 },
      }),
      buildDivisionExecutionJob({
        projectId: 'running',
        projectName: 'In Production',
        status: 'production',
        bidSnapshot: bidSnapshot(10_000),
        laborEntries: [
          {
            payPeriodId: 'pp-1',
            periodStart: '2026-05-01',
            periodEnd: '2026-05-07',
            periodLocked: false,
            periodCompletedAt: null,
            personId: 'c-4',
            personType: '1099',
            source: 'piece',
            amount: 1_000,
            category: 'finisher',
          entryIndex: 0,
          },
        ],
        materialEntries: [],
        subEntries: [],
        estLabor: 50_000,
        estLaborByTrade: { hanger: 0, finisher: 50_000, components: 0, prepClean: 0 },
      }),
    ]

    const perf = aggregateDivisionLaborPerformance(jobs)

    expect(perf.jobCount).toBe(2)
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

describe('aggregateTakeoffAccuracy', () => {
  const now = new Date('2026-10-02T12:00:00.000Z')

  function measuredJob(overrides: {
    projectId: string
    quotedSqft: number
    measuredSqft: number
    measuredAt?: string | null
  }): DivisionExecutionJob {
    return buildDivisionExecutionJob({
      projectId: overrides.projectId,
      projectName: overrides.projectId,
      status: 'production',
      bidSnapshot: bidSnapshot(10_000),
      laborEntries: [],
      materialEntries: [],
      subEntries: [],
      quotedSqft: overrides.quotedSqft,
      measuredSqft: overrides.measuredSqft,
      measuredAt:
        overrides.measuredAt === undefined ? '2026-09-15T00:00:00.000Z' : overrides.measuredAt,
    })
  }

  it('carries quoted and measured sqft through buildDivisionExecutionJob', () => {
    const job = measuredJob({ projectId: 'p1', quotedSqft: 10_000, measuredSqft: 9_000 })
    expect(job.quotedSqft).toBe(10_000)
    expect(job.measuredSqft).toBe(9_000)
    expect(job.measuredAt).toBe('2026-09-15T00:00:00.000Z')
  })

  it('defaults the sqft fields to zero when a caller does not supply them', () => {
    const job = buildDivisionExecutionJob({
      projectId: 'p1',
      projectName: 'p1',
      status: 'production',
      bidSnapshot: bidSnapshot(10_000),
      laborEntries: [],
      materialEntries: [],
      subEntries: [],
    })
    expect(job.quotedSqft).toBe(0)
    expect(job.measuredSqft).toBe(0)
    expect(job.measuredAt).toBeNull()
  })

  // The exclusion that matters most: six live jobs measure the quoted sqft exactly, because
  // the quote was written FROM the takeoff. Scoring those as perfect flatters the estimate
  // with its own answer, so they are not judgeable at all.
  it('drops jobs whose measured sqft equals the quote exactly', () => {
    const scoped = scopeTakeoffAccuracyJobs(
      [
        measuredJob({ projectId: 'tie', quotedSqft: 4_049, measuredSqft: 4_049 }),
        measuredJob({ projectId: 'real', quotedSqft: 4_049, measuredSqft: 3_900 }),
      ],
      now,
    )
    expect(scoped.map((j) => j.projectId)).toEqual(['real'])
  })

  it('drops jobs below the sqft floor, where a sheet or two swings the percentage', () => {
    const scoped = scopeTakeoffAccuracyJobs(
      [
        // The live outlier: quoted 39 sqft, measured 144. Not a 269% estimating error.
        measuredJob({ projectId: 'patch', quotedSqft: 39, measuredSqft: 144 }),
        measuredJob({
          projectId: 'floor',
          quotedSqft: TAKEOFF_ACCURACY_MIN_SQFT,
          measuredSqft: 400,
        }),
      ],
      now,
    )
    expect(scoped.map((j) => j.projectId)).toEqual(['floor'])
  })

  it('drops unmeasured jobs and measurements older than 12 months', () => {
    const scoped = scopeTakeoffAccuracyJobs(
      [
        measuredJob({ projectId: 'unmeasured', quotedSqft: 10_000, measuredSqft: 0 }),
        measuredJob({ projectId: 'unquoted', quotedSqft: 0, measuredSqft: 9_000 }),
        measuredJob({
          projectId: 'stale',
          quotedSqft: 10_000,
          measuredSqft: 9_000,
          measuredAt: '2024-01-01T00:00:00.000Z',
        }),
        measuredJob({
          projectId: 'undated',
          quotedSqft: 10_000,
          measuredSqft: 9_000,
          measuredAt: null,
        }),
        measuredJob({ projectId: 'ok', quotedSqft: 10_000, measuredSqft: 9_000 }),
      ],
      now,
    )
    expect(scoped.map((j) => j.projectId)).toEqual(['ok'])
  })

  it('reports a weighted and a median figure, and they can disagree', () => {
    // Shaped like the live data: one big job measured in part drags the weighted number
    // well past where the typical job sits. This is exactly why the card headlines median.
    const accuracy = aggregateTakeoffAccuracy(
      [
        measuredJob({ projectId: 'partial', quotedSqft: 20_000, measuredSqft: 8_000 }),
        measuredJob({ projectId: 'a', quotedSqft: 1_000, measuredSqft: 980 }),
        measuredJob({ projectId: 'b', quotedSqft: 1_000, measuredSqft: 990 }),
      ],
      now,
    )

    expect(accuracy.jobCount).toBe(3)
    expect(accuracy.totalQuotedSqft).toBe(22_000)
    expect(accuracy.totalMeasuredSqft).toBe(9_970)
    expect(accuracy.overallVariancePct).toBeCloseTo((9_970 - 22_000) / 22_000, 5)
    // Median is the middle job (-2%), nowhere near the weighted -54.7%.
    expect(accuracy.medianVariancePct).toBeCloseTo(-0.02, 5)
    expect(accuracy.underCount).toBe(3)
    expect(accuracy.overCount).toBe(0)
  })

  it('averages the median across two middle jobs on an even count', () => {
    const accuracy = aggregateTakeoffAccuracy(
      [
        measuredJob({ projectId: 'a', quotedSqft: 1_000, measuredSqft: 900 }),
        measuredJob({ projectId: 'b', quotedSqft: 1_000, measuredSqft: 1_100 }),
      ],
      now,
    )
    expect(accuracy.medianVariancePct).toBeCloseTo(0, 5)
  })

  it('buckets by the month measured and ranks the furthest off first', () => {
    const accuracy = aggregateTakeoffAccuracy(
      [
        measuredJob({
          projectId: 'sept',
          quotedSqft: 10_000,
          measuredSqft: 9_000,
          measuredAt: '2026-09-15T00:00:00.000Z',
        }),
        measuredJob({
          projectId: 'aug',
          quotedSqft: 10_000,
          measuredSqft: 13_000,
          measuredAt: '2026-08-15T00:00:00.000Z',
        }),
      ],
      now,
    )

    expect(accuracy.byMonth).toHaveLength(12)
    const sept = accuracy.byMonth.find((m) => m.month === '2026-09')!
    expect(sept.jobCount).toBe(1)
    expect(sept.variancePct).toBeCloseTo(-0.1, 5)

    const aug = accuracy.byMonth.find((m) => m.month === '2026-08')!
    expect(aug.jobCount).toBe(1)
    expect(aug.variancePct).toBeCloseTo(0.3, 5)

    expect(accuracy.mostOff[0].projectId).toBe('aug')
    expect(accuracy.overCount).toBe(1)
    expect(accuracy.underCount).toBe(1)
  })

  it('returns an empty twelve-month shape when nothing is judgeable', () => {
    const accuracy = aggregateTakeoffAccuracy(
      [measuredJob({ projectId: 'tie', quotedSqft: 4_049, measuredSqft: 4_049 })],
      now,
    )
    expect(accuracy.jobCount).toBe(0)
    expect(accuracy.overallVariancePct).toBeNull()
    expect(accuracy.medianVariancePct).toBeNull()
    expect(accuracy.mostOff).toEqual([])
    expect(accuracy.byMonth).toHaveLength(12)
    expect(accuracy.byMonth.every((m) => m.variancePct === null)).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import {
  combineProjectCost,
  computeCurrentCrew,
  computeMarginVsBid,
  splitMaterialByProductionWindow,
  splitSubByProductionWindow,
  summarizeMaterial,
  summarizeSub,
} from './projectCostMath'
import type { DrywallProjectLaborSummary } from './projectLaborMath'
import type { BidSnapshot } from '@/types/drywall'

const emptyLaborSummary = (): DrywallProjectLaborSummary => ({
  totalCost: 0,
  totalHours: 0,
  totalOvertimeHours: 0,
  totalPieces: 0,
  w2BurdenCost: 0,
  byCategory: {
    hanger: 0,
    finisher: 0,
    components: 0,
    prepClean: 0,
    legacy: 0,
    hourly: 0,
    other: 0,
  },
  byPayPeriod: [],
  entries: [],
})

describe('summarizeMaterial / summarizeSub', () => {
  it('sums entry amounts', () => {
    const material = summarizeMaterial([
      { id: '1', date: '2026-05-01', description: 'Board', vendor: 'L&W', amount: 100 },
      { id: '2', date: '2026-05-02', description: 'Mud', vendor: null, amount: 50 },
    ])
    expect(material.totalCost).toBe(150)
    expect(material.entries).toHaveLength(2)

    const sub = summarizeSub([
      {
        id: '1',
        date: '2026-05-01',
        subcontractorName: 'Acme',
        description: 'Taping',
        amount: 200,
      },
    ])
    expect(sub.totalCost).toBe(200)
  })
})

describe('combineProjectCost', () => {
  it('sums labor, material, and sub into totalCost', () => {
    const labor: DrywallProjectLaborSummary = { ...emptyLaborSummary(), totalCost: 5000 }
    const combined = combineProjectCost(
      labor,
      summarizeMaterial([
        { id: '1', date: '2026-05-01', description: 'Board', vendor: null, amount: 1200 },
      ]),
      summarizeSub([]),
    )
    expect(combined.labor.totalCost).toBe(5000)
    expect(combined.material.totalCost).toBe(1200)
    expect(combined.sub.totalCost).toBe(0)
    expect(combined.totalCost).toBe(6200)
  })
})

describe('computeMarginVsBid', () => {
  const bid: BidSnapshot = {
    total: 10_000,
    at: '2026-05-01T00:00:00.000Z',
    payload: {
      routineSubtotal: 8000,
      cleanupTotal: 0,
      overhead: 500,
      profit: 1000,
      salesTax: 500,
      bidTotal: 10_000,
      lineItems: [],
      alternates: [],
    },
  }

  it('returns neutral when no bid snapshot', () => {
    const result = computeMarginVsBid(
      combineProjectCost(emptyLaborSummary(), summarizeMaterial([]), summarizeSub([])),
      null,
    )
    expect(result.marginPct).toBeNull()
    expect(result.marginColor).toBe('neutral')
  })

  it('classifies margin thresholds', () => {
    const costAt30 = combineProjectCost(
      { ...emptyLaborSummary(), totalCost: 7000 },
      summarizeMaterial([]),
      summarizeSub([]),
    )
    expect(computeMarginVsBid(costAt30, bid)).toMatchObject({
      marginPct: 0.3,
      marginColor: 'green',
    })

    const costAt28 = combineProjectCost(
      { ...emptyLaborSummary(), totalCost: 7200 },
      summarizeMaterial([]),
      summarizeSub([]),
    )
    expect(computeMarginVsBid(costAt28, bid)).toMatchObject({
      marginPct: 0.28,
      marginColor: 'yellow',
    })

    const costAt24 = combineProjectCost(
      { ...emptyLaborSummary(), totalCost: 7600 },
      summarizeMaterial([]),
      summarizeSub([]),
    )
    expect(computeMarginVsBid(costAt24, bid)).toMatchObject({
      marginPct: 0.24,
      marginColor: 'red',
    })
  })
})

describe('computeCurrentCrew', () => {
  it('returns distinct names from the latest pay period', () => {
    const summary: DrywallProjectLaborSummary = {
      ...emptyLaborSummary(),
      byPayPeriod: [
        {
          payPeriodId: 'pp-old',
          periodStart: '2026-04-01',
          periodEnd: '2026-04-07',
          locked: true,
          cost: 100,
        },
        {
          payPeriodId: 'pp-new',
          periodStart: '2026-05-01',
          periodEnd: '2026-05-07',
          locked: true,
          cost: 200,
        },
      ],
      entries: [
        {
          payPeriodId: 'pp-old',
          periodStart: '2026-04-01',
          periodEnd: '2026-04-07',
          periodLocked: true,
          periodCompletedAt: null,
          personId: '1',
          personType: 'w2',
          personName: 'Old Worker',
          source: 'hour',
          hours: 8,
          amount: 100,
          category: 'hourly',
          entryIndex: 0,
        },
        {
          payPeriodId: 'pp-new',
          periodStart: '2026-05-01',
          periodEnd: '2026-05-07',
          periodLocked: true,
          periodCompletedAt: null,
          personId: '2',
          personType: 'w2',
          personName: 'Alice',
          source: 'hour',
          hours: 8,
          amount: 100,
          category: 'hourly',
          entryIndex: 0,
        },
        {
          payPeriodId: 'pp-new',
          periodStart: '2026-05-01',
          periodEnd: '2026-05-07',
          periodLocked: true,
          periodCompletedAt: null,
          personId: '3',
          personType: '1099',
          personName: 'Bob',
          source: 'piece',
          amount: 100,
          category: 'hanger',
          entryIndex: 0,
        },
        {
          payPeriodId: 'pp-new',
          periodStart: '2026-05-01',
          periodEnd: '2026-05-07',
          periodLocked: true,
          periodCompletedAt: null,
          personId: '2',
          personType: 'w2',
          personName: 'Alice',
          source: 'hour',
          hours: 4,
          amount: 50,
          category: 'hourly',
          entryIndex: 0,
        },
      ],
    }

    const crew = computeCurrentCrew(summary, { maxNames: 5 })
    expect(crew.total).toBe(2)
    expect(crew.names).toEqual(['Alice', 'Bob'])
  })
})

describe('splitMaterialByProductionWindow / splitSubByProductionWindow', () => {
  const timestamps = {
    productionStartedAt: '2026-04-15T00:00:00.000Z',
    productionCompletedAt: '2026-05-20T00:00:00.000Z',
    closedAt: '2026-06-30T00:00:00.000Z',
  }

  const material = [
    { id: '1', date: '2026-04-01', description: 'Pre', vendor: null, amount: 10 },
    { id: '2', date: '2026-05-01', description: 'During', vendor: null, amount: 20 },
    { id: '3', date: '2026-06-01', description: 'After', vendor: null, amount: 30 },
  ]

  it('buckets material entries by date', () => {
    const split = splitMaterialByProductionWindow(material, timestamps)
    expect(split.preProduction).toHaveLength(1)
    expect(split.duringProduction).toHaveLength(1)
    expect(split.afterProduction).toHaveLength(1)
  })

  it('puts all sub entries in unbounded when production never started', () => {
    const sub = [
      {
        id: '1',
        date: '2026-05-01',
        subcontractorName: 'Sub',
        description: 'Work',
        amount: 100,
      },
    ]
    const split = splitSubByProductionWindow(sub, {})
    expect(split.unbounded).toHaveLength(1)
    expect(split.duringProduction).toHaveLength(0)
  })
})

import { describe, expect, it } from 'vitest'
import { LABOR_TAX_RATE } from '@/lib/drywall/calculations/quantityUtils'
import {
  classifyLaborCategory,
  extractAllProjectLaborEntries,
  extractProjectLaborEntries,
  splitLaborByProductionWindow,
  summarizeProjectLabor,
  type PayPeriodForLabor,
} from './projectLaborMath'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import { DEFAULT_DASHBOARD_TARGETS } from '@/lib/drywall/dashboardTargets'

const emptyCatalogs: OrgDrywallCatalogs = {
  boards: [],
  finish_scopes: [
    {
      id: 'level_4',
      display_name: 'Level 4',
      applies_to_locations: ['wall', 'ceiling'],
      finisher_rate: 0.45,
      accessories_applied: {
        joint_compound: true,
        tape: true,
        screws: true,
        corner_bead: true,
      },
      payroll_piece_key: 'level_4',
    },
  ],
  accessories: [],
  rc_channel: [],
  suspended_grid: [],
  insulation: [],
  acoustic: [],
  metal_stud: [],
  frp: [],
  marginFloorTarget: 0.3,
  poEstimatedCostPerSqft: 2.5,
  dashboardTargets: DEFAULT_DASHBOARD_TARGETS,
}

describe('classifyLaborCategory', () => {
  it('classifies hanger, finisher, component, legacy, and hourly', () => {
    expect(classifyLaborCategory('hour', emptyCatalogs)).toBe('hourly')
    expect(classifyLaborCategory('piece', emptyCatalogs, 'drywall_hanging')).toBe('hanger')
    expect(classifyLaborCategory('piece', emptyCatalogs, 'level_4')).toBe('finisher')
    expect(classifyLaborCategory('piece', emptyCatalogs, 'rc_channel_labor')).toBe('components')
    expect(classifyLaborCategory('piece', emptyCatalogs, undefined, 'other')).toBe('legacy')
    expect(classifyLaborCategory('piece', emptyCatalogs, 'unknown_key')).toBe('other')
  })

  it('maps legacy payroll work types to trade categories', () => {
    expect(classifyLaborCategory('piece', emptyCatalogs, undefined, 'hang')).toBe('hanger')
    expect(classifyLaborCategory('piece', emptyCatalogs, undefined, 'finisher')).toBe('finisher')
    expect(classifyLaborCategory('piece', emptyCatalogs, undefined, 'carpenter')).toBe('components')
    expect(classifyLaborCategory('piece', emptyCatalogs, undefined, 'rcChannel')).toBe('components')
    expect(classifyLaborCategory('piece', emptyCatalogs, undefined, 'prepClean')).toBe('prepClean')
    expect(classifyLaborCategory('piece', emptyCatalogs, 'bogus_piece_key')).toBe('other')
  })
})

describe('extractProjectLaborEntries', () => {
  const projectId = 'proj-abc'
  const periods: PayPeriodForLabor[] = [
    {
      id: 'pp-1',
      startDate: '2026-05-12',
      endDate: '2026-05-18',
      locked: true,
      completedAt: '2026-05-19T12:00:00.000Z',
      entries: [
        {
          personId: 'emp-1',
          personType: 'w2',
          personName: 'Alice',
          hourEntries: [
            {
              id: 'h1',
              jobId: projectId,
              jobName: 'Site A',
              hours: 8,
              overtimeType: 'regular',
            },
            {
              id: 'h2',
              jobId: 'other-project',
              jobName: 'Other',
              hours: 4,
              overtimeType: 'regular',
            },
          ],
          pieceEntries: [
            {
              id: 'p1',
              jobId: projectId,
              jobName: 'Site A',
              piece_key: 'drywall_hanging',
              totalPhases: 1,
              phasesCompleted: 1,
              jobTotalSqft: 1000,
              rate: 0.5,
              amount: 500,
            },
          ],
          reimbursement: 75,
          perDiem: 50,
        },
        {
          personId: 'sub-1',
          personType: '1099',
          personName: 'Bob',
          pieceEntries: [
            {
              id: 'p2',
              jobId: projectId,
              jobName: 'Site A',
              piece_key: 'level_4',
              totalPhases: 5,
              phasesCompleted: 2,
              jobTotalSqft: 1000,
              rate: 0.4,
              amount: 160,
            },
          ],
        },
      ],
    },
  ]

  it('extracts matched hour and piece rows and excludes reimbursements', () => {
    const flat = extractProjectLaborEntries(periods, projectId, emptyCatalogs, {
      'w2-emp-1': 25,
    })
    expect(flat).toHaveLength(3)
    expect(flat.filter((e) => e.source === 'hour')).toHaveLength(1)
    expect(flat.find((e) => e.source === 'hour')?.amount).toBe(200)
    expect(flat.find((e) => e.personType === '1099')).toBeDefined()
    expect(flat.some((e) => e.category === 'hanger')).toBe(true)
    expect(flat.some((e) => e.category === 'finisher')).toBe(true)
  })

  it('summarizes totals and groups by pay period with W2 burden on actuals', () => {
    const flat = extractProjectLaborEntries(periods, projectId, emptyCatalogs, {
      'w2-emp-1': 25,
    })
    const summary = summarizeProjectLabor(flat)
    const w2Hour = 200 * (1 + LABOR_TAX_RATE)
    const w2Piece = 500 * (1 + LABOR_TAX_RATE)
    const subPiece = 160
    expect(summary.totalCost).toBeCloseTo(w2Hour + w2Piece + subPiece, 2)
    expect(summary.w2BurdenCost).toBeCloseTo((w2Hour - 200) + (w2Piece - 500), 2)
    expect(summary.totalHours).toBe(8)
    expect(summary.totalOvertimeHours).toBe(0)
    expect(summary.totalPieces).toBeCloseTo(1000 + 400, 2)
    expect(summary.byPayPeriod).toHaveLength(1)
    expect(summary.byPayPeriod[0].cost).toBe(summary.totalCost)
    const categorySum = Object.values(summary.byCategory).reduce((a, b) => a + b, 0)
    expect(categorySum).toBeCloseTo(summary.totalCost, 2)
    expect(summary.entries.find((e) => e.personType === 'w2' && e.source === 'hour')?.amount).toBeCloseTo(
      w2Hour,
      2,
    )
    expect(summary.entries.find((e) => e.personType === '1099')?.amount).toBe(subPiece)
  })
})

describe('extractAllProjectLaborEntries', () => {
  const projectA = 'proj-a'
  const projectB = 'proj-b'
  const periods: PayPeriodForLabor[] = [
    {
      id: 'pp-1',
      startDate: '2026-05-12',
      endDate: '2026-05-18',
      locked: true,
      completedAt: null,
      entries: [
        {
          personId: 'emp-1',
          personType: 'w2',
          hourEntries: [
            {
              id: 'h1',
              jobId: projectA,
              jobName: 'Site A',
              hours: 8,
              overtimeType: 'regular',
            },
            {
              id: 'h2',
              jobId: '',
              jobName: 'Unassigned',
              hours: 4,
              overtimeType: 'regular',
            },
            {
              id: 'h3',
              jobId: 'unassigned',
              jobName: 'Unassigned',
              hours: 2,
              overtimeType: 'regular',
            },
          ],
          pieceEntries: [
            {
              id: 'p1',
              jobId: projectB,
              jobName: 'Site B',
              piece_key: 'drywall_hanging',
              totalPhases: 1,
              phasesCompleted: 1,
              jobTotalSqft: 500,
              rate: 0.5,
              amount: 250,
            },
          ],
        },
      ],
    },
  ]

  it('buckets labor entries by jobId and skips unassigned rows', () => {
    const byProject = extractAllProjectLaborEntries(periods, emptyCatalogs, { 'w2-emp-1': 25 })
    expect(byProject.get(projectA)).toHaveLength(1)
    expect(byProject.get(projectB)).toHaveLength(1)
    expect(byProject.get('')).toBeUndefined()
    expect(byProject.get('unassigned')).toBeUndefined()
    expect(extractProjectLaborEntries(periods, projectA, emptyCatalogs, { 'w2-emp-1': 25 })).toEqual(
      byProject.get(projectA) ?? [],
    )
  })
})

describe('splitLaborByProductionWindow', () => {
  const entries = [
    {
      payPeriodId: 'a',
      periodStart: '2026-04-01',
      periodEnd: '2026-04-07',
      periodLocked: true,
      periodCompletedAt: null,
      personId: '1',
      personType: 'w2',
      source: 'hour' as const,
      hours: 8,
      amount: 100,
      category: 'hourly' as const,
    },
    {
      payPeriodId: 'b',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-07',
      periodLocked: true,
      periodCompletedAt: null,
      personId: '1',
      personType: 'w2',
      source: 'hour' as const,
      hours: 8,
      amount: 200,
      category: 'hourly' as const,
    },
    {
      payPeriodId: 'c',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-07',
      periodLocked: false,
      periodCompletedAt: null,
      personId: '1',
      personType: 'w2',
      source: 'hour' as const,
      hours: 8,
      amount: 300,
      category: 'hourly' as const,
    },
  ]

  it('puts all entries in unbounded when production never started', () => {
    const split = splitLaborByProductionWindow(entries, {})
    expect(split.unbounded).toHaveLength(3)
    expect(split.duringProduction).toHaveLength(0)
  })

  it('buckets by production timestamps using period end', () => {
    const split = splitLaborByProductionWindow(entries, {
      productionStartedAt: '2026-04-15T00:00:00.000Z',
      productionCompletedAt: '2026-05-20T00:00:00.000Z',
      closedAt: '2026-06-30T00:00:00.000Z',
    })
    expect(split.preProduction).toHaveLength(1)
    expect(split.duringProduction).toHaveLength(1)
    expect(split.afterProduction).toHaveLength(1)
  })

  it('keeps post-start entries in duringProduction when not completed', () => {
    const split = splitLaborByProductionWindow(entries, {
      productionStartedAt: '2026-04-15T00:00:00.000Z',
      productionCompletedAt: null,
    })
    expect(split.preProduction).toHaveLength(1)
    expect(split.duringProduction).toHaveLength(2)
    expect(split.afterProduction).toHaveLength(0)
  })
})

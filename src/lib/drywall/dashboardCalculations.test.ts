import { describe, expect, it } from 'vitest'
import { eachDayOfInterval, endOfMonth, isWeekend, startOfMonth } from 'date-fns'
import {
  computeNorthStarMetrics,
  computeQbRevenueMetrics,
  computeRevenuePaceMetrics,
  countActiveCrew,
  computeCapacityMetrics,
  computeEstimatingMetrics,
  deriveRevenueGoals,
  deriveRevenuePerSqft,
  type BacklogMetrics,
  type CapacityMetrics,
  type DashboardQbInvoiceInput,
  type ManpowerMetrics,
} from './dashboardCalculations'
import { DEFAULT_DASHBOARD_TARGETS } from './dashboardTargets'
import type { DashboardTargets } from './dashboardTargets'
import type { DrywallProjectListItem } from '@/types/drywall'
import type { OrgTeamPayload } from '@/types/hr'

const NOW = new Date('2026-07-15T12:00:00Z')

function estimatingProject(
  overrides: Partial<DrywallProjectListItem> & Pick<DrywallProjectListItem, 'id'>,
): DrywallProjectListItem {
  return {
    id: overrides.id,
    name: overrides.name ?? 'Test Project',
    client: overrides.client ?? 'Client',
    address: overrides.address ?? '123 Main',
    status: overrides.status ?? 'quote',
    updatedAt: overrides.updatedAt ?? NOW,
    sqft: overrides.sqft ?? 10000,
    quoteTotal: overrides.quoteTotal ?? 100_000,
    fieldMeasuredSqft: overrides.fieldMeasuredSqft ?? null,
    fieldTakeoffUpdated: overrides.fieldTakeoffUpdated ?? null,
    fieldFirstMeasurementId: overrides.fieldFirstMeasurementId ?? null,
    orderFirstId: overrides.orderFirstId ?? null,
    quoteOutcome: overrides.quoteOutcome ?? 'sent',
    quoteApprovedAt: overrides.quoteApprovedAt ?? null,
    quoteSentAt: overrides.quoteSentAt ?? null,
    quoteLostAt: overrides.quoteLostAt ?? null,
    quoteOverheadAmount: overrides.quoteOverheadAmount ?? null,
    quoteProfitAmount: overrides.quoteProfitAmount ?? null,
    drywallScopeRevenue: overrides.drywallScopeRevenue ?? null,
  }
}

function teamWithHanger(
  employees: OrgTeamPayload['employees'],
  contractors1099: OrgTeamPayload['contractors1099'],
): OrgTeamPayload {
  return {
    employees,
    contractors1099,
    positions: [{ id: 'pos-hanger', name: 'Hanger' }],
  }
}

describe('countActiveCrew', () => {
  it('counts each 1099 hanger as one subbed crew (not pooled)', () => {
    const team = teamWithHanger(
      [],
      [{ id: 'sub-1', name: 'ABC Drywall', positionId: 'pos-hanger', status: 'active' }],
    )

    const beforeStyle = Math.floor(1 / 3)
    expect(beforeStyle).toBe(0)

    const crew = countActiveCrew(team, 3)
    expect(crew).toMatchObject({
      activeHangers: 1,
      subbedHangerCrews: 1,
      w2Hangers: 0,
      hangerCrews: 1,
    })
  })

  it('pools W2 hangers and adds subbed crews separately', () => {
    const team = teamWithHanger(
      [
        { id: 'w2-1', name: 'A', positionId: 'pos-hanger', status: 'active' },
        { id: 'w2-2', name: 'B', positionId: 'pos-hanger', status: 'active' },
        { id: 'w2-3', name: 'C', positionId: 'pos-hanger', status: 'active' },
        { id: 'w2-4', name: 'D', positionId: 'pos-hanger', status: 'active' },
      ],
      [{ id: 'sub-1', name: 'Sub Co', positionId: 'pos-hanger', status: 'active' }],
    )

    const crew = countActiveCrew(team, 3)
    expect(crew.w2Hangers).toBe(4)
    expect(crew.subbedHangerCrews).toBe(1)
    expect(crew.hangerCrews).toBe(1 + Math.floor(4 / 3))
    expect(crew.hangerCrews).toBe(2)
  })

  it('counts finishers from W2 and 1099 without crew pooling', () => {
    const team: OrgTeamPayload = {
      positions: [
        { id: 'pos-hanger', name: 'Hanger' },
        { id: 'pos-finisher', name: 'Finisher' },
      ],
      employees: [
        { id: 'w2-f', name: 'Finisher W2', positionId: 'pos-finisher', status: 'active' },
      ],
      contractors1099: [
        { id: 'sub-f', name: 'Finisher Sub', positionId: 'pos-finisher', status: 'active' },
      ],
    }

    const crew = countActiveCrew(team, 3)
    expect(crew.activeFinishers).toBe(2)
    expect(crew.productionFinishers).toBe(2)
    expect(crew.apprenticeFinishers).toBe(0)
    expect(crew.pointupFinishers).toBe(0)
  })

  it('tiers finishers by position name for capacity', () => {
    const team: OrgTeamPayload = {
      positions: [
        { id: 'pos-prod', name: 'Finisher' },
        { id: 'pos-app', name: 'Apprentice Finisher' },
        { id: 'pos-point', name: 'Pointup Specialist' },
        { id: 'pos-both', name: 'Hanger / Finisher' },
      ],
      employees: [
        { id: 'prod-1', name: 'Prod 1', positionId: 'pos-prod', status: 'active' },
        { id: 'prod-2', name: 'Prod 2', positionId: 'pos-prod', status: 'active' },
        { id: 'prod-3', name: 'Prod 3', positionId: 'pos-prod', status: 'active' },
        { id: 'app-1', name: 'App 1', positionId: 'pos-app', status: 'active' },
        { id: 'pt-1', name: 'PT 1', positionId: 'pos-point', status: 'active' },
        { id: 'both-1', name: 'Both 1', positionId: 'pos-both', status: 'active' },
      ],
      contractors1099: [
        { id: 'pt-2', name: 'PT 2', positionId: 'pos-point', status: 'active' },
      ],
    }

    const crew = countActiveCrew(team, 3)
    expect(crew.productionFinishers).toBe(4)
    expect(crew.apprenticeFinishers).toBe(1)
    expect(crew.pointupFinishers).toBe(2)
    expect(crew.activeFinishers).toBe(5)
  })

  it('excludes point-up from finishing throughput', () => {
    const team: OrgTeamPayload = {
      positions: [{ id: 'pos-point', name: 'Pointup Specialist' }],
      employees: [{ id: 'pt', name: 'PT', positionId: 'pos-point', status: 'active' }],
      contractors1099: [],
    }
    const crew = countActiveCrew(team, 3)
    expect(crew.pointupFinishers).toBe(1)
    expect(crew.activeFinishers).toBe(0)

    const capacity = computeCapacityMetrics(crew, DEFAULT_DASHBOARD_TARGETS, 2)
    expect(capacity.finisherSqftMo).toBe(0)
  })

  it('rates apprentice finishers at the reduced sqft/day', () => {
    const team: OrgTeamPayload = {
      positions: [{ id: 'pos-app', name: 'Apprentice Finisher' }],
      employees: [{ id: 'app', name: 'App', positionId: 'pos-app', status: 'active' }],
      contractors1099: [],
    }
    const crew = countActiveCrew(team, 3)
    const { workingDaysPerMonth, capacity: cap } = DEFAULT_DASHBOARD_TARGETS
    const metrics = computeCapacityMetrics(crew, DEFAULT_DASHBOARD_TARGETS, 2)

    expect(metrics.finisherSqftMo).toBe(
      cap.finisherApprenticeSqftPerDay * workingDaysPerMonth,
    )
  })

  it('rates production finishers at full sqft/day', () => {
    const team: OrgTeamPayload = {
      positions: [{ id: 'pos-prod', name: 'Finisher' }],
      employees: [{ id: 'prod', name: 'Prod', positionId: 'pos-prod', status: 'active' }],
      contractors1099: [],
    }
    const crew = countActiveCrew(team, 3)
    const { workingDaysPerMonth, capacity: cap } = DEFAULT_DASHBOARD_TARGETS
    const metrics = computeCapacityMetrics(crew, DEFAULT_DASHBOARD_TARGETS, 2)

    expect(metrics.finisherSqftMo).toBe(cap.finisherSqftPerDay * workingDaysPerMonth)
  })

  it('blends tiered finishing throughput for mixed crews', () => {
    const team: OrgTeamPayload = {
      positions: [
        { id: 'pos-prod', name: 'Finisher' },
        { id: 'pos-app', name: 'Apprentice Finisher' },
        { id: 'pos-point', name: 'Pointup Specialist' },
      ],
      employees: [
        { id: 'p1', name: 'P1', positionId: 'pos-prod', status: 'active' },
        { id: 'p2', name: 'P2', positionId: 'pos-prod', status: 'active' },
        { id: 'p3', name: 'P3', positionId: 'pos-prod', status: 'active' },
        { id: 'app', name: 'App', positionId: 'pos-app', status: 'active' },
        { id: 'pt1', name: 'PT1', positionId: 'pos-point', status: 'active' },
      ],
      contractors1099: [{ id: 'pt2', name: 'PT2', positionId: 'pos-point', status: 'active' }],
    }

    const crew = countActiveCrew(team, 3)
    const { workingDaysPerMonth, capacity: cap } = DEFAULT_DASHBOARD_TARGETS
    const metrics = computeCapacityMetrics(crew, DEFAULT_DASHBOARD_TARGETS, 2)

    const expected =
      3 * cap.finisherSqftPerDay * workingDaysPerMonth +
      1 * cap.finisherApprenticeSqftPerDay * workingDaysPerMonth
    expect(metrics.finisherSqftMo).toBe(expected)

    const legacyFlat =
      crew.activeFinishers * cap.finisherSqftPerDay * workingDaysPerMonth
    expect(legacyFlat).toBe(201_600)
    expect(metrics.finisherSqftMo).toBe(176_400)
    expect(metrics.finisherSqftMo).toBeLessThan(legacyFlat)
  })
})

describe('computeEstimatingMetrics', () => {
  it('counts a quote sent this month in bid volume', () => {
    const projects = [
      estimatingProject({
        id: 'bid-1',
        quoteOutcome: 'sent',
        quoteSentAt: '2026-07-10T10:00:00Z',
        quoteTotal: 50_000,
      }),
    ]

    const m = computeEstimatingMetrics(projects, NOW)
    expect(m.bidVolumeCount).toBe(1)
    expect(m.bidVolumeValue).toBe(50_000)
  })

  it('counts approved this month as awarded and in hit rate', () => {
    const projects = [
      estimatingProject({
        id: 'won-1',
        quoteOutcome: 'approved',
        quoteSentAt: '2026-06-01T10:00:00Z',
        quoteApprovedAt: '2026-07-05T10:00:00Z',
        quoteTotal: 80_000,
      }),
    ]

    const m = computeEstimatingMetrics(projects, NOW)
    expect(m.awardedCount).toBe(1)
    expect(m.awardedValue).toBe(80_000)
    expect(m.hitRateMonth).toBe(1)
    expect(m.avgJobSize).toBe(80_000)
    expect(m.bidVolumeCount).toBe(0)
  })

  it('lowers hit rate when a quote is lost this month', () => {
    const projects = [
      estimatingProject({
        id: 'won-1',
        quoteOutcome: 'approved',
        quoteApprovedAt: '2026-07-05T10:00:00Z',
      }),
      estimatingProject({
        id: 'lost-1',
        quoteOutcome: 'lost',
        quoteLostAt: '2026-07-08T10:00:00Z',
      }),
    ]

    const m = computeEstimatingMetrics(projects, NOW)
    expect(m.hitRateMonth).toBe(0.5)
  })

  it('includes undecided sent quotes in pending', () => {
    const projects = [
      estimatingProject({
        id: 'pending-1',
        quoteOutcome: 'sent',
        quoteSentAt: '2026-05-01T10:00:00Z',
        quoteTotal: 120_000,
      }),
    ]

    const m = computeEstimatingMetrics(projects, NOW)
    expect(m.pendingCount).toBe(1)
    expect(m.pendingValue).toBe(120_000)
  })

  it('computes avg margin as (overhead + profit) / total for bids sent this month', () => {
    const projects = [
      estimatingProject({
        id: 'bid-margin',
        quoteOutcome: 'sent',
        quoteSentAt: '2026-07-02T10:00:00Z',
        quoteTotal: 100_000,
        quoteOverheadAmount: 10_000,
        quoteProfitAmount: 15_000,
      }),
    ]

    const m = computeEstimatingMetrics(projects, NOW)
    expect(m.avgMargin).toBeCloseTo(0.25)
  })

  it('excludes drafts from all metrics', () => {
    const projects = [
      estimatingProject({
        id: 'draft-1',
        quoteOutcome: 'drafted',
        quoteSentAt: '2026-07-02T10:00:00Z',
        quoteTotal: 200_000,
      }),
    ]

    const m = computeEstimatingMetrics(projects, NOW)
    expect(m.bidVolumeCount).toBe(0)
    expect(m.pendingCount).toBe(0)
  })
})

describe('deriveRevenuePerSqft', () => {
  it('uses size-weighted drywall scope revenue, not a simple average of full-quote ratios', () => {
    const projects = [
      estimatingProject({
        id: 'small',
        quoteOutcome: 'approved',
        sqft: 1_000,
        quoteTotal: 10_000,
        drywallScopeRevenue: 4_000,
      }),
      estimatingProject({
        id: 'large',
        quoteOutcome: 'approved',
        sqft: 9_000,
        quoteTotal: 90_000,
        drywallScopeRevenue: 36_000,
      }),
    ]

    expect(deriveRevenuePerSqft(projects, null)).toBeCloseTo(4)
    expect(deriveRevenuePerSqft(projects, null)).not.toBeCloseTo(10)
  })

  it('skips approved quotes without derivable drywall scope revenue', () => {
    const projects = [
      estimatingProject({
        id: 'with-rev',
        quoteOutcome: 'approved',
        sqft: 5_000,
        drywallScopeRevenue: 15_000,
      }),
      estimatingProject({
        id: 'missing-snapshot',
        quoteOutcome: 'approved',
        sqft: 5_000,
        drywallScopeRevenue: null,
      }),
    ]

    expect(deriveRevenuePerSqft(projects, null)).toBe(3)
  })

  it('returns manual override when set', () => {
    const projects = [
      estimatingProject({
        id: 'ignored',
        quoteOutcome: 'approved',
        sqft: 1_000,
        drywallScopeRevenue: 5_000,
      }),
    ]

    expect(deriveRevenuePerSqft(projects, 2.75)).toBe(2.75)
  })
})

const NORTH_STAR_NOW = new Date('2026-07-15T12:00:00Z')

const stubCapacity: CapacityMetrics = {
  hangerCrews: 2,
  finishers: 8,
  hangerSqftMo: 100_000,
  finisherSqftMo: 200_000,
  throughputSqft: 100_000,
  revenuePerSqft: 4,
  monthlyCapacity: 400_000,
  weeklyCapacity: 92_378,
  requiredMonthly: 541_667,
  pctOfRequired: 0.74,
  capacityGap: -141_667,
  bottleneck: 'hanging',
  status: 'yellow',
}

const stubManpower: ManpowerMetrics = {
  finishers: { label: 'Finishers', current: 8, target: 8, gap: 0, status: 'green' },
  hangerCrews: { label: 'Hanger Crews', current: 2, target: 2, gap: 0, status: 'green' },
  fillPct: 1,
}

const stubBacklog: BacklogMetrics = {
  currentBacklog: 1_000_000,
  goalBacklog: 1_250_000,
  monthsRemaining: 2.5,
  pctOfGoal: 0.8,
  status: 'yellow',
  upcomingStarts: [],
  upcomingCompletions: [],
}

function northStarTargets(overrides: Partial<DashboardTargets> = {}): DashboardTargets {
  return { ...DEFAULT_DASHBOARD_TARGETS, ...overrides }
}

function runNorthStar(
  projects: DrywallProjectListItem[],
  targets: DashboardTargets = northStarTargets(),
  qbInvoices: DashboardQbInvoiceInput[] = [],
) {
  const qbRevenue = computeQbRevenueMetrics(qbInvoices, NORTH_STAR_NOW)
  return computeNorthStarMetrics(
    projects,
    targets,
    stubCapacity,
    stubManpower,
    stubBacklog,
    qbRevenue,
    NORTH_STAR_NOW,
  )
}

describe('computeNorthStarMetrics off-system baseline', () => {
  const inSystemProject = estimatingProject({
    id: 'in-system',
    quoteOutcome: 'approved',
    quoteApprovedAt: '2026-03-01T10:00:00Z',
    quoteTotal: 500_000,
  })

  it('adds baseline with matching year to awarded YTD and pace', () => {
    const without = runNorthStar([inSystemProject])
    const withBaseline = runNorthStar([inSystemProject], northStarTargets({
      offSystemAwardedYtd: 1_000_000,
      offSystemAwardedYtdYear: 2026,
    }))

    expect(without.awardedInSystem).toBe(500_000)
    expect(without.awardedBaseline).toBe(0)
    expect(without.awardedYtd).toBe(500_000)

    expect(withBaseline.awardedInSystem).toBe(500_000)
    expect(withBaseline.awardedBaseline).toBe(1_000_000)
    expect(withBaseline.awardedYtd).toBe(1_500_000)
    expect(withBaseline.currentPace).toBeGreaterThan(without.currentPace)
    expect(withBaseline.pctOfRequired).toBeGreaterThan(without.pctOfRequired)
  })

  it('ignores baseline when year does not match current calendar year', () => {
    const m = runNorthStar([inSystemProject], northStarTargets({
      offSystemAwardedYtd: 1_000_000,
      offSystemAwardedYtdYear: 2025,
    }))

    expect(m.awardedBaseline).toBe(0)
    expect(m.awardedYtd).toBe(500_000)
  })

  it('applies baseline when year is null', () => {
    const m = runNorthStar([inSystemProject], northStarTargets({
      offSystemAwardedYtd: 750_000,
      offSystemAwardedYtdYear: null,
    }))

    expect(m.awardedBaseline).toBe(750_000)
    expect(m.awardedYtd).toBe(1_250_000)
  })
})

describe('QB billings pace (QB.2)', () => {
  const inSystemProject = estimatingProject({
    id: 'in-system',
    quoteOutcome: 'approved',
    quoteApprovedAt: '2026-03-01T10:00:00Z',
    quoteTotal: 500_000,
  })

  const qbInvoices: DashboardQbInvoiceInput[] = [
    {
      totalAmt: 2_000_000,
      balance: 400_000,
      txnDate: '2026-06-10',
      matchedProjectId: null,
    },
    {
      totalAmt: 50_000,
      balance: 0,
      txnDate: '2026-07-05',
      matchedProjectId: 'proj-1',
    },
  ]

  it('uses billings for North Star pace when accepted invoices exist (ignores manual baseline)', () => {
    const awardedOnly = runNorthStar(
      [inSystemProject],
      northStarTargets({ offSystemAwardedYtd: 1_000_000, offSystemAwardedYtdYear: 2026 }),
    )
    const withBillings = runNorthStar(
      [inSystemProject],
      northStarTargets({ offSystemAwardedYtd: 1_000_000, offSystemAwardedYtdYear: 2026 }),
      qbInvoices,
    )

    expect(awardedOnly.paceSource).toBe('awarded')
    expect(awardedOnly.awardedYtd).toBe(1_500_000)

    expect(withBillings.paceSource).toBe('billings')
    expect(withBillings.billingsYtd).toBe(2_050_000)
    expect(withBillings.currentPace).toBeGreaterThan(awardedOnly.currentPace)
    expect(withBillings.currentPace).not.toBeCloseTo(awardedOnly.currentPace)
  })

  it('falls back to awarded + baseline when no billings YTD', () => {
    const m = runNorthStar(
      [inSystemProject],
      northStarTargets({ offSystemAwardedYtd: 250_000, offSystemAwardedYtdYear: 2026 }),
    )
    expect(m.paceSource).toBe('awarded')
    expect(m.awardedYtd).toBe(750_000)
  })

  it('computes projected EOM and variance from month billings using work days', () => {
    const qbRevenue = computeQbRevenueMetrics(qbInvoices, NORTH_STAR_NOW)
    const monthlyGoal = deriveRevenueGoals(DEFAULT_DASHBOARD_TARGETS).monthly
    const pace = computeRevenuePaceMetrics(qbRevenue, monthlyGoal, NORTH_STAR_NOW)

    const monthStart = startOfMonth(NORTH_STAR_NOW)
    const monthEnd = endOfMonth(NORTH_STAR_NOW)
    const workDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd }).filter(
      (d) => !isWeekend(d),
    ).length
    const workDaysElapsed = eachDayOfInterval({ start: monthStart, end: NORTH_STAR_NOW }).filter(
      (d) => !isWeekend(d),
    ).length
    const workDaysRemaining = workDaysInMonth - workDaysElapsed
    const billingsThisMonth = 50_000

    expect(qbRevenue.billingsThisMonth).toBe(billingsThisMonth)
    expect(qbRevenue.ar).toBe(400_000)
    expect(pace.hasBillings).toBe(true)
    expect(pace.projectedEom).toBeCloseTo((billingsThisMonth / workDaysElapsed) * workDaysInMonth, 0)
    expect(pace.workDaysRemaining).toBe(workDaysRemaining)
    expect(pace.variance).toBeCloseTo(pace.projectedEom - monthlyGoal, 0)

    // July 15 2026: 11 work days elapsed of 23 in month → higher EOM than calendar 15/31
    const calendarProjected = (billingsThisMonth / 15) * 31
    expect(pace.projectedEom).toBeGreaterThan(calendarProjected)
    expect(workDaysElapsed).toBe(11)
    expect(workDaysInMonth).toBe(23)
    expect(workDaysRemaining).toBe(12)
  })
})

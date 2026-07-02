import { describe, expect, it } from 'vitest'
import { countActiveCrew, computeEstimatingMetrics, deriveRevenuePerSqft } from './dashboardCalculations'
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

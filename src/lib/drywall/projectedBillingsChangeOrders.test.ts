import { describe, expect, it } from 'vitest'
import type { DrywallProjectListItem } from '@/types/drywall'
import type { CrossProjectScheduleItem } from '@/services/drywallScheduleAggregateService'
import { DEFAULT_DASHBOARD_TARGETS } from './dashboardTargets'
import { computeProjectedBillings } from './dashboardCalculations'

function project(overrides: Partial<DrywallProjectListItem> = {}): DrywallProjectListItem {
  return {
    id: 'project-1',
    name: 'Production job',
    client: 'Customer',
    address: '123 Main',
    status: 'production',
    updatedAt: new Date('2026-07-15T12:00:00Z'),
    sqft: 10_000,
    quoteTotal: 100_000,
    effectiveContractValue: 120_000,
    acceptedChangeOrderRevenue: 20_000,
    fieldMeasuredSqft: null,
    fieldTakeoffUpdated: null,
    fieldFirstMeasurementId: null,
    orderFirstId: null,
    quoteOutcome: 'approved',
    quoteApprovedAt: '2026-01-10T12:00:00Z',
    quoteSentAt: '2026-01-05T12:00:00Z',
    quoteLostAt: null,
    quoteOverheadAmount: null,
    quoteProfitAmount: null,
    drywallScopeRevenue: null,
    ...overrides,
  }
}

function draw(id: string, name: string, startDate: string): CrossProjectScheduleItem {
  return {
    id,
    projectId: 'project-1',
    projectName: 'Production job',
    projectStatus: 'production',
    name,
    type: 'office',
    startDate,
    endDate: startDate,
    status: 'not-started',
    assignedPersons: [],
  }
}

describe('projected billings with change orders', () => {
  it('forecasts the effective contract and consumes accepted invoices from early draws', () => {
    const result = computeProjectedBillings(
      [project()],
      [draw('draw-1', 'Bill 50%', '2026-08-01'), draw('draw-2', 'Bill 50%', '2026-09-01')],
      [
        {
          totalAmt: 30_000,
          balance: 0,
          txnDate: '2026-07-10',
          matchedProjectId: 'project-1',
        },
      ],
      DEFAULT_DASHBOARD_TARGETS,
      new Date('2026-07-15T12:00:00Z'),
    )

    expect(result.billedYtd).toBe(30_000)
    expect(result.scheduledRestOfYear).toBe(90_000)
    expect(result.projectedYearEndTotal).toBe(120_000)
    expect(result.rows[7].projected).toBe(30_000)
    expect(result.rows[8].projected).toBe(60_000)
  })

  it('caps future draws at zero when the contract is already fully billed', () => {
    const result = computeProjectedBillings(
      [project()],
      [draw('draw-1', 'Bill remainder', '2026-08-01')],
      [
        {
          totalAmt: 125_000,
          balance: 0,
          txnDate: '2026-07-10',
          matchedProjectId: 'project-1',
        },
      ],
      DEFAULT_DASHBOARD_TARGETS,
      new Date('2026-07-15T12:00:00Z'),
    )

    expect(result.scheduledRestOfYear).toBe(0)
    expect(result.rows[7].projected).toBe(0)
  })

  it('keeps current-month draws projected when invoices this month pay earlier draws', () => {
    // Catch-up invoice in July pays the June draw; July's scheduled Bill must still forecast.
    const result = computeProjectedBillings(
      [project({ effectiveContractValue: 100_000, quoteTotal: 100_000 })],
      [draw('draw-1', 'Bill 50%', '2026-06-01'), draw('draw-2', 'Bill 50%', '2026-07-20')],
      [
        {
          totalAmt: 50_000,
          balance: 0,
          txnDate: '2026-07-05',
          matchedProjectId: 'project-1',
        },
      ],
      DEFAULT_DASHBOARD_TARGETS,
      new Date('2026-07-15T12:00:00Z'),
    )

    expect(result.rows[5].projected).toBe(0)
    expect(result.rows[6].projected).toBe(50_000)
    expect(result.rows[6].actual).toBe(50_000)
    expect(result.scheduledRestOfYear).toBe(50_000)
    expect(result.projectedYearEndTotal).toBe(100_000)
  })

  it('includes unpaid draws earlier in the current month in scheduled rest of year', () => {
    const result = computeProjectedBillings(
      [project({ effectiveContractValue: 80_000, quoteTotal: 80_000 })],
      [draw('draw-1', 'Bill 100%', '2026-07-01')],
      [],
      DEFAULT_DASHBOARD_TARGETS,
      new Date('2026-07-15T12:00:00Z'),
    )

    expect(result.rows[6].projected).toBe(80_000)
    expect(result.scheduledRestOfYear).toBe(80_000)
  })
})

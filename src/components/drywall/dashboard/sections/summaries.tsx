// ============================================================================
// Section summaries — the tile layer
// ============================================================================
//
// One summary per registered section, each picking the single figure that answers "do I need
// to open this?". They read the same hooks and the same status helpers as the full sections,
// so a tile cannot disagree with the detail it opens; where a section derived its headline
// inline, that logic was exported rather than copied (see `overallEfficiencyPillStatus`).
//
// Kept in one file deliberately. Each is a dozen lines, they are a single layer of the UI,
// and splitting them across the twelve section files would mean editing all twelve to add a
// view none of them renders.
//
// Choosing the figure is the real work here and is a judgement each time: Estimating leads on
// pending quotes because that is the number Mark acts on, while Financials leads on AR for
// the same reason — neither is simply the first stat in the card.

import { useMemo } from 'react'
import {
  computeDashboardAlerts,
  computeFinancialsMetrics,
  computeProjectedBillings,
  formatDashboardCurrency,
  formatDashboardPercent,
} from '@/lib/drywall/dashboardCalculations'
import { estimatingAccuracyColor } from '@/services/drywallDivisionAggregateService'
import { KpiTile, type SectionSummaryProps } from '../ui/KpiTile'
import { useDashboardData } from '../useDashboardData'
import { useDivisionExecution } from '../useDivisionExecution'
import { alertsHeaderStatus } from './AlertsSection'
import { marginPillStatus } from './DivisionMarginSection'
import { overallEfficiencyPillStatus } from './LaborPerformanceSection'

/** Signed percent at one decimal, matching the accuracy cards rather than whole-point rounding. */
function signedPct(ratio: number | null): string | null {
  if (ratio == null) return null
  const pct = ratio * 100
  if (Math.abs(pct) < 0.05) return '0.0%'
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`
}

export function AlertsSummary(p: SectionSummaryProps) {
  const { metrics, projects, scheduleItems, qbInvoices, targets, loading } = useDashboardData()
  const { jobs, laborPerformance, accuracy, loading: executionLoading } = useDivisionExecution()

  const alerts = useMemo(
    () =>
      computeDashboardAlerts(
        metrics,
        { jobs, laborPerformance, accuracy },
        { projects, scheduleItems, qbInvoices, targets },
        new Date(),
      ),
    [metrics, jobs, laborPerformance, accuracy, projects, scheduleItems, qbInvoices, targets],
  )

  const critical = alerts.filter((a) => a.severity === 'critical').length
  const warning = alerts.filter((a) => a.severity === 'warning').length

  return (
    <KpiTile
      {...p}
      title="Alerts"
      value={String(alerts.length)}
      // The count alone does not say whether to drop everything, so the caption carries the
      // severity split rather than a bare "items".
      caption={critical > 0 ? `${critical} critical` : warning > 0 ? `${warning} to watch` : 'all clear'}
      status={alertsHeaderStatus(critical, warning)}
      loading={loading || executionLoading}
    />
  )
}

export function RevenuePaceSummary(p: SectionSummaryProps) {
  const { metrics, loading } = useDashboardData()
  const rp = metrics.revenuePace
  return (
    <KpiTile
      {...p}
      title="Revenue pace"
      value={formatDashboardPercent(rp.pctOfGoal)}
      caption="of monthly goal"
      status={rp.status}
      loading={loading}
    />
  )
}

export function EstimatingSummary(p: SectionSummaryProps) {
  const { metrics, loading } = useDashboardData()
  const e = metrics.estimating
  return (
    <KpiTile
      {...p}
      title="Estimating"
      value={String(e.pendingCount)}
      caption="quotes pending"
      // EstimatingMetrics carries no status, and inventing a threshold for "too many quotes
      // out" would be a number nobody agreed to.
      status={null}
      loading={loading}
    />
  )
}

export function ProductionCapacitySummary(p: SectionSummaryProps) {
  const { metrics, loading } = useDashboardData()
  const { capacity } = metrics
  return (
    <KpiTile
      {...p}
      title="Production capacity"
      value={formatDashboardPercent(capacity.pctOfRequired)}
      caption="of required"
      status={capacity.status}
      loading={loading}
    />
  )
}

export function ManpowerSummary(p: SectionSummaryProps) {
  const { metrics, loading } = useDashboardData()
  const { manpower } = metrics
  return (
    <KpiTile
      {...p}
      title="Manpower"
      value={formatDashboardPercent(manpower.fillPct)}
      caption="staffed"
      // Same two-state rule the section's pill uses: at target or not.
      status={manpower.fillPct >= 1 ? 'green' : 'red'}
      loading={loading}
    />
  )
}

export function BacklogSummary(p: SectionSummaryProps) {
  const { metrics, loading } = useDashboardData()
  const { backlog } = metrics
  return (
    <KpiTile
      {...p}
      title="Backlog"
      value={
        backlog.monthsRemaining == null ? null : `${backlog.monthsRemaining.toFixed(1)} mo`
      }
      caption="of work"
      status={backlog.status}
      loading={loading}
    />
  )
}

export function DivisionExecutionSummary(p: SectionSummaryProps) {
  const { marginRollUp, loading } = useDivisionExecution()
  return (
    <KpiTile
      {...p}
      title="Division execution"
      value={
        marginRollUp.aggregateMarginPct == null
          ? null
          : formatDashboardPercent(marginRollUp.aggregateMarginPct)
      }
      caption="margin vs bid"
      status={marginPillStatus(marginRollUp.aggregateMarginColor)}
      loading={loading}
    />
  )
}

export function LaborPerformanceSummary(p: SectionSummaryProps) {
  const { laborPerformance, loading } = useDivisionExecution()
  const { overallEfficiencyPct } = laborPerformance
  return (
    <KpiTile
      {...p}
      title="Labor performance"
      // Already a percentage of estimate, not a ratio — 100% is on the money.
      value={overallEfficiencyPct == null ? null : `${Math.round(overallEfficiencyPct)}%`}
      caption="of estimate"
      status={overallEfficiencyPillStatus(overallEfficiencyPct)}
      loading={loading}
    />
  )
}

export function EstimatingAccuracySummary(p: SectionSummaryProps) {
  const { accuracy, loading } = useDivisionExecution()
  const { overallVariancePct } = accuracy
  return (
    <KpiTile
      {...p}
      title="Estimating accuracy"
      value={signedPct(overallVariancePct)}
      caption={
        overallVariancePct == null
          ? 'no completed jobs'
          : overallVariancePct > 0
            ? 'over estimate'
            : 'under estimate'
      }
      status={
        estimatingAccuracyColor(overallVariancePct) === 'neutral'
          ? null
          : (estimatingAccuracyColor(overallVariancePct) as 'green' | 'yellow' | 'red')
      }
      loading={loading}
    />
  )
}

export function TakeoffAccuracySummary(p: SectionSummaryProps) {
  const { takeoffAccuracy, loading } = useDivisionExecution()
  const { medianVariancePct } = takeoffAccuracy
  const color = estimatingAccuracyColor(medianVariancePct)
  return (
    <KpiTile
      {...p}
      title="Takeoff accuracy"
      value={signedPct(medianVariancePct)}
      // Negative means measured came in under the quote, so the takeoff ran heavy. The sign
      // alone is ambiguous on this card, which is why the caption says which way.
      caption={
        medianVariancePct == null
          ? 'not enough measured'
          : medianVariancePct < 0
            ? 'takeoffs run heavy'
            : 'takeoffs run light'
      }
      status={color === 'neutral' ? null : (color as 'green' | 'yellow' | 'red')}
      loading={loading}
    />
  )
}

export function FinancialsSummary(p: SectionSummaryProps) {
  const { qbInvoices, loading } = useDashboardData()
  const { jobs, loading: executionLoading } = useDivisionExecution()
  const metrics = useMemo(() => computeFinancialsMetrics(jobs, qbInvoices), [jobs, qbInvoices])
  return (
    <KpiTile
      {...p}
      title="Financials"
      value={formatDashboardCurrency(metrics.arTotal)}
      caption="in AR"
      status={metrics.status}
      loading={loading || executionLoading}
    />
  )
}

export function ProjectedBillingsSummary(p: SectionSummaryProps) {
  const { projects, scheduleItems, qbInvoices, targets, loading } = useDashboardData()
  const metrics = useMemo(
    () => computeProjectedBillings(projects, scheduleItems, qbInvoices, targets, new Date()),
    [projects, scheduleItems, qbInvoices, targets],
  )
  return (
    <KpiTile
      {...p}
      title="Projected billings"
      value={formatDashboardCurrency(metrics.projectedYearEndTotal)}
      caption="projected year end"
      status={metrics.status}
      loading={loading}
    />
  )
}

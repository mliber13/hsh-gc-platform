import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  computeProjectedBillings,
  formatDashboardCurrency,
  formatDashboardPercent,
} from '@/lib/drywall/dashboardCalculations'
import { useDashboardData } from '../useDashboardData'
import { BigStat } from '../ui/BigStat'
import { KpiCard } from '../ui/KpiCard'
import { ProgressBar } from '../ui/ProgressBar'
import { StatusPill } from '../ui/StatusPill'

export function RevenuePaceSection() {
  const { metrics, projects, scheduleItems, qbInvoices, targets } = useDashboardData()
  const { revenuePace: rp } = metrics

  // Bottom-up EOM: MTD actuals + remaining scheduled draws this month (projected is already
  // net of lifetime invoice consumption — do not use max, which drops catch-up invoices).
  const scheduledEom = useMemo(() => {
    const pb = computeProjectedBillings(projects, scheduleItems, qbInvoices, targets, new Date())
    const row = pb.rows[new Date().getMonth()]
    return row ? row.actual + row.projected : 0
  }, [projects, scheduleItems, qbInvoices, targets])

  if (!rp.hasBillings) {
    return (
      <KpiCard
        title="Revenue Pace"
        description="Monthly billings vs goal from QuickBooks"
      >
        <p className="text-sm text-muted-foreground">
          Connect and sync QuickBooks, then include invoices on the{' '}
          <Link
            to="/drywall/settings/quickbooks"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            QuickBooks revenue
          </Link>{' '}
          page to see billings pace and AR here.
        </p>
      </KpiCard>
    )
  }

  return (
    <KpiCard
      title="Revenue Pace"
      description="Monthly billings vs goal from QuickBooks"
      headerRight={
        <StatusPill status={rp.status} label={`${formatDashboardPercent(rp.pctOfGoal)} of goal`} />
      }
    >
      <BigStat
        label="Current Month Billings"
        value={formatDashboardCurrency(rp.billingsThisMonth)}
        sublabel={`Goal ${formatDashboardCurrency(rp.monthlyGoal)}`}
      />

      <ProgressBar
        label="% of Monthly Goal"
        value={rp.pctOfGoal}
        max={1}
        status={rp.status}
      />

      <dl className="space-y-2.5 rounded-lg border px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              EOM (run-rate)
            </dt>
            <dd className="text-[11px] text-muted-foreground">
              Pace · {rp.workDaysRemaining} work day{rp.workDaysRemaining === 1 ? '' : 's'} left
            </dd>
          </div>
          <dd className="shrink-0 text-base font-semibold tabular-nums">
            {formatDashboardCurrency(rp.projectedEom)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t pt-2.5">
          <div className="min-w-0">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              EOM (scheduled)
            </dt>
            <dd className="text-[11px] text-muted-foreground">From billing schedule</dd>
          </div>
          <dd className="shrink-0 text-base font-semibold tabular-nums">
            {formatDashboardCurrency(scheduledEom)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t pt-2.5">
          <div className="min-w-0">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Variance
            </dt>
            <dd className="text-[11px] text-muted-foreground">
              {rp.variance >= 0 ? 'Ahead of monthly goal' : 'Behind monthly goal'}
            </dd>
          </div>
          <dd className="shrink-0 text-base font-semibold tabular-nums">
            {formatDashboardCurrency(rp.variance)}
          </dd>
        </div>
      </dl>

      <div className="mt-auto rounded-lg border bg-muted/30 px-3 py-2.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Accounts Receivable
        </p>
        <p className="mt-0.5 text-xl font-semibold tabular-nums">{formatDashboardCurrency(rp.ar)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Open QB balance · {formatDashboardPercent(rp.pctOfGoal)} of goal MTD
        </p>
      </div>
    </KpiCard>
  )
}

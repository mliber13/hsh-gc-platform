import { Link } from 'react-router-dom'
import {
  formatDashboardCurrency,
  formatDashboardPercent,
} from '@/lib/drywall/dashboardCalculations'
import { useDashboardData } from '../useDashboardData'
import { BigStat } from '../ui/BigStat'
import { KpiCard } from '../ui/KpiCard'
import { ProgressBar } from '../ui/ProgressBar'
import { StatusPill } from '../ui/StatusPill'

export function RevenuePaceSection() {
  const { metrics } = useDashboardData()
  const { revenuePace: rp } = metrics

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
      headerRight={<StatusPill status={rp.status} />}
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

      <div className="grid gap-3 sm:grid-cols-2">
        <BigStat
          label="Projected EOM"
          value={formatDashboardCurrency(rp.projectedEom)}
          sublabel={`${rp.workDaysRemaining} work day${rp.workDaysRemaining === 1 ? '' : 's'} left`}
        />
        <BigStat
          label="Variance"
          value={formatDashboardCurrency(rp.variance)}
          sublabel={rp.variance >= 0 ? 'Ahead of monthly goal' : 'Behind monthly goal'}
        />
      </div>

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

import {
  formatDashboardCurrency,
  formatDashboardPercent,
} from '@/lib/drywall/dashboardCalculations'
import { useDashboardData } from './useDashboardData'
import { BigStat } from './ui/BigStat'
import { KpiCard } from './ui/KpiCard'
import { ProgressBar } from './ui/ProgressBar'
import { StatusPill } from './ui/StatusPill'

export function NorthStarCard() {
  const { metrics } = useDashboardData()
  const { northStar } = metrics

  return (
    <KpiCard
      title="North Star — Revenue Pace"
      description="Are we on pace to hit the annual revenue goal?"
      emphasized
      headerRight={<StatusPill status={northStar.status} />}
    >
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <BigStat label="Annual Goal" value={formatDashboardCurrency(northStar.annualGoal)} />
        <BigStat
          label="Current Pace"
          value={formatDashboardCurrency(northStar.currentPace)}
          sublabel={`${formatDashboardCurrency(northStar.awardedYtd)} awarded YTD`}
        />
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            % of Required Pace
          </p>
          <ProgressBar
            value={northStar.pctOfRequired}
            max={1}
            status={northStar.status}
            showGauge
          />
          <p className="text-lg font-semibold tabular-nums">
            {formatDashboardPercent(northStar.pctOfRequired)}
          </p>
        </div>
        <BigStat
          label="Revenue Gap"
          value={formatDashboardCurrency(northStar.revenueGap)}
          sublabel={northStar.revenueGap >= 0 ? 'Ahead of goal' : 'Behind goal'}
        />
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Biggest Constraint
        </p>
        <p className="mt-1 text-base font-semibold text-foreground">{northStar.biggestConstraint}</p>
      </div>
    </KpiCard>
  )
}

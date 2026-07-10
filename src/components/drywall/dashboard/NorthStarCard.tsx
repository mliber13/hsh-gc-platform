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
      headerRight={
        <StatusPill
          status={northStar.status}
          label={`${formatDashboardPercent(northStar.pctOfRequired)} pace`}
        />
      }
    >
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <BigStat label="Annual Goal" value={formatDashboardCurrency(northStar.annualGoal)} size="lg" />
        <BigStat
          label="Current Pace"
          size="lg"
          value={formatDashboardCurrency(northStar.currentPace)}
          sublabel={
            <span>
              {northStar.paceSource === 'billings' ? (
                <>
                  {formatDashboardCurrency(northStar.billingsYtd)} billings YTD
                  <span className="block text-muted-foreground/80">
                    Pace from QuickBooks billings
                  </span>
                </>
              ) : (
                <>
                  {formatDashboardCurrency(northStar.awardedYtd)} awarded YTD
                  {northStar.awardedBaseline > 0 ? (
                    <span className="block text-muted-foreground/80">
                      incl. {formatDashboardCurrency(northStar.awardedBaseline)} booked outside HSH
                    </span>
                  ) : null}
                  <span className="block text-muted-foreground/80">Pace from awarded quotes</span>
                </>
              )}
            </span>
          }
        />
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            % of Required Pace
          </p>
          <p className="text-3xl font-semibold tracking-tight tabular-nums md:text-4xl">
            {formatDashboardPercent(northStar.pctOfRequired)}
          </p>
          <ProgressBar
            value={northStar.pctOfRequired}
            max={1}
            status={northStar.status}
            showValue={false}
          />
        </div>
        <BigStat
          label="Revenue Gap"
          size="lg"
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

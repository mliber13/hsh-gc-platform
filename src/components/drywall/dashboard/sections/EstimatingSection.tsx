import {
  formatDashboardCurrency,
  formatDashboardPercent,
} from '@/lib/drywall/dashboardCalculations'
import { useDashboardData } from '../useDashboardData'
import { BigStat } from '../ui/BigStat'
import { KpiCard } from '../ui/KpiCard'

function formatPercentOrDash(ratio: number | null): string {
  return ratio != null ? formatDashboardPercent(ratio) : '—'
}

export function EstimatingSection() {
  const { metrics } = useDashboardData()
  const e = metrics.estimating

  return (
    <KpiCard
      title="Estimating"
      description="Bid pipeline and win rate — current calendar month"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <BigStat
          label="Bid Volume (This Month)"
          value={String(e.bidVolumeCount)}
          sublabel={formatDashboardCurrency(e.bidVolumeValue)}
        />
        <BigStat
          label="Awarded Work"
          value={String(e.awardedCount)}
          sublabel={formatDashboardCurrency(e.awardedValue)}
        />
      </div>

      <div className="rounded-lg border bg-muted/30 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hit Rate</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{formatPercentOrDash(e.hitRateMonth)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Trailing 90d: {formatPercentOrDash(e.hitRateTrailing90)}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <BigStat
          label="Pending Proposals"
          value={String(e.pendingCount)}
          sublabel={formatDashboardCurrency(e.pendingValue)}
        />
        <BigStat
          label="Avg Margin"
          value={formatPercentOrDash(e.avgMargin)}
          sublabel="Bid markup (overhead + profit)"
        />
      </div>

      <BigStat
        label="Avg Job Size"
        value={e.avgJobSize != null ? formatDashboardCurrency(e.avgJobSize) : '—'}
        sublabel="Mean awarded quote this month"
      />
    </KpiCard>
  )
}

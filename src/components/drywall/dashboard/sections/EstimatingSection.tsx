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
      stretch={false}
    >
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <BigStat
          size="sm"
          label="Bid Volume (This Month)"
          value={String(e.bidVolumeCount)}
          sublabel={formatDashboardCurrency(e.bidVolumeValue)}
        />
        <BigStat
          size="sm"
          label="Awarded Work"
          value={String(e.awardedCount)}
          sublabel={formatDashboardCurrency(e.awardedValue)}
        />
        <BigStat
          size="sm"
          label="Hit Rate (This Month)"
          value={formatPercentOrDash(e.hitRateMonth)}
          sublabel={`Trailing 90d: ${formatPercentOrDash(e.hitRateTrailing90)}`}
        />
        <BigStat
          size="sm"
          label="Pending Proposals"
          value={String(e.pendingCount)}
          sublabel={formatDashboardCurrency(e.pendingValue)}
        />
        <BigStat
          size="sm"
          label="Avg Margin"
          value={formatPercentOrDash(e.avgMargin)}
          sublabel="Bid markup (overhead + profit)"
        />
        <BigStat
          size="sm"
          label="Avg Job Size"
          value={e.avgJobSize != null ? formatDashboardCurrency(e.avgJobSize) : '—'}
          sublabel="Mean awarded quote this month"
        />
      </div>
    </KpiCard>
  )
}

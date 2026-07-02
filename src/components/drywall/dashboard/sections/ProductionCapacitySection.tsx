import {
  formatDashboardCurrency,
  formatDashboardPercent,
} from '@/lib/drywall/dashboardCalculations'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useDashboardData } from '../useDashboardData'
import { BigStat } from '../ui/BigStat'
import { KpiCard } from '../ui/KpiCard'
import { ProgressBar } from '../ui/ProgressBar'
import { StatusPill } from '../ui/StatusPill'

function formatRevenuePerSqft(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function ProductionCapacitySection() {
  const { metrics } = useDashboardData()
  const { capacity } = metrics

  const bottleneckLabel =
    capacity.bottleneck === 'hanging'
      ? 'Hanging is the bottleneck — add hanger crews or increase hang rate'
      : 'Finishing is the bottleneck — add finishers or increase finish rate'

  return (
    <KpiCard
      title="Production Capacity"
      description="Monthly throughput based on crew bottleneck model"
      headerRight={<StatusPill status={capacity.status} />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <BigStat label="Monthly Capacity" value={formatDashboardCurrency(capacity.monthlyCapacity)} />
        <BigStat label="Weekly Capacity" value={formatDashboardCurrency(capacity.weeklyCapacity)} />
      </div>

      <ProgressBar
        label="% of Required Monthly"
        value={capacity.pctOfRequired}
        max={1}
        status={capacity.status}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <BigStat
          label="Capacity Gap"
          value={formatDashboardCurrency(capacity.capacityGap)}
          sublabel={`Required ${formatDashboardCurrency(capacity.requiredMonthly)}/mo`}
        />
        <BigStat
          label="Throughput"
          value={`${Math.round(capacity.throughputSqft).toLocaleString()} sqft/mo`}
          sublabel={
            capacity.revenuePerSqft != null ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help underline decoration-dotted underline-offset-2">
                      @ {formatRevenuePerSqft(capacity.revenuePerSqft)}/sqft (drywall, blended)
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Weighted avg drywall revenue per board sqft across approved quotes. Override in
                    Dashboard Targets.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              'No revenue/sqft data — approve quotes with bid snapshots and sqft'
            )
          }
        />
      </div>

      <p className="text-sm text-muted-foreground">{bottleneckLabel}</p>
      {capacity.monthlyCapacity === 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Zero crew or missing revenue/sqft — capacity cannot be computed yet.
        </p>
      )}
    </KpiCard>
  )
}

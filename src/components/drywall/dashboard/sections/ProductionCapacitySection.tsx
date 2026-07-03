import {
  formatDashboardCurrency,
  type CrewCounts,
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

function formatSqftMo(value: number): string {
  return `${Math.round(value).toLocaleString()} sqft/mo`
}

function formatFinisherComposition(crew: CrewCounts): string {
  const parts: string[] = []
  if (crew.productionFinishers > 0) parts.push(`${crew.productionFinishers} production`)
  if (crew.apprenticeFinishers > 0) parts.push(`${crew.apprenticeFinishers} apprentice`)
  if (parts.length === 0) {
    return `${crew.activeFinishers} finisher${crew.activeFinishers === 1 ? '' : 's'}`
  }
  return parts.join(' + ')
}

function StageCapacityRow({
  label,
  sqftMo,
  resourceLabel,
  isBottleneck,
  isFaster,
  slack,
}: {
  label: string
  sqftMo: number
  resourceLabel: string
  isBottleneck: boolean
  isFaster: boolean
  slack: number
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
        <span className="tabular-nums">
          {formatSqftMo(sqftMo)} · {resourceLabel}
        </span>
        {isBottleneck ? (
          <span className="inline-flex rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
            Bottleneck
          </span>
        ) : null}
        {isFaster ? (
          <span className="text-xs">
            {slack === 0 ? 'balanced' : `${formatSqftMo(slack)} idle`}
          </span>
        ) : null}
      </div>
    </div>
  )
}

export function ProductionCapacitySection() {
  const { metrics } = useDashboardData()
  const { capacity, crew } = metrics

  const hangingIsBottleneck = capacity.bottleneck === 'hanging'
  const slack = Math.abs(capacity.hangerSqftMo - capacity.finisherSqftMo)

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

      <div className="space-y-3 rounded-lg border bg-muted/20 px-4 py-3">
        <StageCapacityRow
          label="Hanging"
          sqftMo={capacity.hangerSqftMo}
          resourceLabel={`${capacity.hangerCrews} crew${capacity.hangerCrews === 1 ? '' : 's'}`}
          isBottleneck={hangingIsBottleneck}
          isFaster={!hangingIsBottleneck}
          slack={slack}
        />
        <StageCapacityRow
          label="Finishing"
          sqftMo={capacity.finisherSqftMo}
          resourceLabel={formatFinisherComposition(crew)}
          isBottleneck={!hangingIsBottleneck}
          isFaster={hangingIsBottleneck}
          slack={slack}
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

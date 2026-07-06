import {
  formatDashboardCurrency,
  formatDashboardPercent,
} from '@/lib/drywall/dashboardCalculations'
import type { LaborPerformanceTradeRow } from '@/services/drywallDivisionAggregateService'
import { cn } from '@/lib/utils'
import { BigStat } from '../ui/BigStat'
import { KpiCard } from '../ui/KpiCard'
import { StatusPill } from '../ui/StatusPill'
import { useDivisionExecution } from '../useDivisionExecution'

const EFFICIENCY_COLOR_CLASS: Record<LaborPerformanceTradeRow['efficiencyColor'], string> = {
  green: 'text-emerald-600 dark:text-emerald-400',
  yellow: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
  neutral: 'text-muted-foreground',
}

function formatEfficiency(pct: number | null): string {
  if (pct == null) return '—'
  return `${pct.toFixed(1)}%`
}

function efficiencyPillStatus(
  color: LaborPerformanceTradeRow['efficiencyColor'],
): 'green' | 'yellow' | 'red' | null {
  if (color === 'neutral') return null
  return color
}

export function LaborPerformanceSection() {
  const { laborPerformance, loading, error } = useDivisionExecution()
  const { totalEstLabor, totalActualLabor, overallEfficiencyPct, tradeRows, unmappedActual } =
    laborPerformance

  if (loading) {
    return (
      <KpiCard title="Labor Performance" description="Estimated vs actual labor by trade">
        <p className="text-sm text-muted-foreground">Loading labor performance…</p>
      </KpiCard>
    )
  }

  if (error) {
    return (
      <KpiCard title="Labor Performance" description="Estimated vs actual labor by trade">
        <p className="text-sm text-destructive">{error}</p>
      </KpiCard>
    )
  }

  const hasData = totalEstLabor > 0 || totalActualLabor > 0
  const overallPill = efficiencyPillStatus(
    overallEfficiencyPct == null
      ? 'neutral'
      : overallEfficiencyPct >= 100
        ? 'green'
        : overallEfficiencyPct >= 90
          ? 'yellow'
          : 'red',
  )

  return (
    <KpiCard
      title="Labor Performance"
      description="Estimated vs actual labor by trade — burden-inclusive"
      headerRight={
        overallPill && overallEfficiencyPct != null ? (
          <StatusPill
            status={overallPill}
            label={`${formatEfficiency(overallEfficiencyPct)} efficiency`}
          />
        ) : null
      }
    >
      {!hasData ? (
        <p className="text-sm text-muted-foreground">
          No labor data in scope yet for in-production or recently completed jobs.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <BigStat
              label="Estimated labor"
              value={formatDashboardCurrency(totalEstLabor)}
              sublabel="Quote burden-inclusive"
            />
            <BigStat
              label="Actual labor"
              value={formatDashboardCurrency(totalActualLabor)}
              sublabel="Payroll + W2 burden"
            />
            <BigStat
              label="Overall efficiency"
              value={formatEfficiency(overallEfficiencyPct)}
              sublabel="Est ÷ actual"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5">Trade</th>
                  <th className="px-3 py-2.5 text-right">Estimated</th>
                  <th className="px-3 py-2.5 text-right">Actual</th>
                  <th className="px-3 py-2.5 text-right">Efficiency</th>
                  <th className="px-3 py-2.5 text-right">$ Variance</th>
                </tr>
              </thead>
              <tbody>
                {tradeRows.map((row) => (
                  <tr key={row.trade} className="border-b last:border-0">
                    <td className="px-3 py-2.5">{row.label}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {formatDashboardCurrency(row.estimated)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatDashboardCurrency(row.actual)}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2.5 text-right font-medium tabular-nums',
                        EFFICIENCY_COLOR_CLASS[row.efficiencyColor],
                      )}
                    >
                      {formatEfficiency(row.efficiencyPct)}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2.5 text-right tabular-nums',
                        row.varianceUsd > 0
                          ? 'text-red-600 dark:text-red-400'
                          : row.varianceUsd < 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-muted-foreground',
                      )}
                    >
                      {formatDashboardCurrency(row.varianceUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {unmappedActual.total > 0 ? (
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Unmapped actual labor</p>
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {unmappedActual.legacy > 0 ? (
                  <li>Legacy: {formatDashboardCurrency(unmappedActual.legacy)}</li>
                ) : null}
                {unmappedActual.hourly > 0 ? (
                  <li>Hourly: {formatDashboardCurrency(unmappedActual.hourly)}</li>
                ) : null}
                {unmappedActual.other > 0 ? (
                  <li>Other: {formatDashboardCurrency(unmappedActual.other)}</li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </KpiCard>
  )
}

import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'
import type { KpiStatus } from '@/lib/drywall/dashboardCalculations'

const fillByStatus: Record<KpiStatus, string> = {
  green: 'hsl(var(--chart-2))',
  yellow: 'hsl(var(--chart-4))',
  red: 'hsl(0 72% 51%)',
}

type Props = {
  value: number
  max?: number
  status?: KpiStatus
  label?: string
  showGauge?: boolean
  className?: string
}

export function ProgressBar({
  value,
  max = 1,
  status = 'green',
  label,
  showGauge = false,
  className,
}: Props) {
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const pctLabel = `${Math.round(pct * 100)}%`

  if (showGauge) {
    const data = [
      { name: 'progress', value: pct },
      { name: 'remainder', value: 1 - pct },
    ]
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <div className="h-10 w-10 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                innerRadius={12}
                outerRadius={18}
                startAngle={90}
                endAngle={-270}
                stroke="none"
              >
                <Cell fill={fillByStatus[status]} />
                <Cell fill="hsl(var(--muted))" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="min-w-0 flex-1">
          {label ? <p className="text-xs text-muted-foreground">{label}</p> : null}
          <p className="text-sm font-medium tabular-nums">{pctLabel}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2 text-xs">
        {label ? <span className="text-muted-foreground">{label}</span> : <span />}
        <span className="font-medium tabular-nums">{pctLabel}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct * 100}%`,
            backgroundColor: fillByStatus[status],
          }}
        />
      </div>
    </div>
  )
}

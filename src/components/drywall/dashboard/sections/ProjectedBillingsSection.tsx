import { useMemo } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  computeProjectedBillings,
  formatDashboardCurrency,
} from '@/lib/drywall/dashboardCalculations'
import { BigStat } from '../ui/BigStat'
import { KpiCard } from '../ui/KpiCard'
import { StatusPill } from '../ui/StatusPill'
import { useDashboardData } from '../useDashboardData'

const ACTUAL_FILL = 'hsl(221 83% 53%)'
const PROJECTED_FILL = 'hsl(215 20% 65%)'
const GOAL_STROKE = 'hsl(38 92% 45%)'

const DESCRIPTION =
  'Scheduled draws × contract value vs. actuals and goal'

export function ProjectedBillingsSection() {
  const {
    projects,
    scheduleItems,
    qbInvoices,
    targets,
    loading,
    error,
  } = useDashboardData()

  const metrics = useMemo(
    () => computeProjectedBillings(projects, scheduleItems, qbInvoices, targets, new Date()),
    [projects, scheduleItems, qbInvoices, targets],
  )

  if (loading) {
    return (
      <KpiCard title="Projected Billings" description={DESCRIPTION}>
        <p className="text-sm text-muted-foreground">Loading projected billings…</p>
      </KpiCard>
    )
  }

  if (error) {
    return (
      <KpiCard title="Projected Billings" description={DESCRIPTION}>
        <p className="text-sm text-destructive">{error}</p>
      </KpiCard>
    )
  }

  const {
    rows,
    billedYtd,
    scheduledRestOfYear,
    projectedYearEndTotal,
    gapToGoal,
    unpricedProjectCount,
    unpricedProjects,
    status,
  } = metrics

  const hasAnyProjected = rows.some((r) => r.projected > 0)
  const hasAnyActual = rows.some((r) => r.actual > 0)

  if (!hasAnyProjected && !hasAnyActual) {
    return (
      <KpiCard
        title="Projected Billings"
        description={DESCRIPTION}
        headerRight={<StatusPill status={status} />}
      >
        <p className="text-sm text-muted-foreground">
          No billing draws on the schedule yet — add items named like “Bill 30%” or “Bill
          final” to forecast draws against contract value.
        </p>
        {unpricedProjectCount > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {unpricedProjectCount} project{unpricedProjectCount === 1 ? '' : 's'} excluded — no
            contract total: {unpricedProjects.map((p) => p.name).join(', ')}
          </p>
        ) : null}
      </KpiCard>
    )
  }

  const currentMonthIndex = new Date().getMonth()

  const chartData = rows.map((row, monthIndex) => {
    // Past: actual billed only.
    // Current month: actual MTD + remaining scheduled draws (projected is already net of
    // lifetime invoice consumption — do not subtract month actuals again).
    // Future: remaining scheduled draws only.
    if (monthIndex < currentMonthIndex) {
      return { label: row.label, month: row.month, actual: row.actual, projected: 0, goal: row.goal }
    }
    if (monthIndex === currentMonthIndex) {
      return {
        label: row.label,
        month: row.month,
        actual: row.actual,
        projected: row.projected,
        goal: row.goal,
      }
    }
    return { label: row.label, month: row.month, actual: 0, projected: row.projected, goal: row.goal }
  })

  return (
    <KpiCard
      title="Projected Billings"
      description={DESCRIPTION}
      headerRight={<StatusPill status={status} />}
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <BigStat
            label="Billed YTD"
            value={formatDashboardCurrency(billedYtd)}
            sublabel="Actual QB invoices this year"
          />
          <BigStat
            label="Scheduled rest of year"
            value={formatDashboardCurrency(scheduledRestOfYear)}
            sublabel="Backlog draws from current jobs"
          />
          <BigStat
            label="Projected year-end"
            value={formatDashboardCurrency(projectedYearEndTotal)}
            sublabel="Billed YTD + scheduled backlog"
          />
          <BigStat
            label="Gap to goal (make-up)"
            value={formatDashboardCurrency(gapToGoal)}
            sublabel={
              gapToGoal >= 0 ? 'On track vs annual goal' : 'Must come from unsold work'
            }
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Monthly billings — {new Date().getFullYear()}
          </p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) =>
                    new Intl.NumberFormat('en-US', {
                      notation: 'compact',
                      maximumFractionDigits: 0,
                    }).format(v)
                  }
                  width={48}
                />
                <Tooltip
                  formatter={(value, name) => {
                    const n = value == null ? null : Number(value)
                    if (n == null || !Number.isFinite(n)) return '—'
                    const label =
                      name === 'actual'
                        ? 'Actual'
                        : name === 'projected'
                          ? 'Projected'
                          : name === 'goal'
                            ? 'Goal'
                            : String(name)
                    return [formatDashboardCurrency(n), label]
                  }}
                  labelFormatter={(label) => `${label} ${new Date().getFullYear()}`}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value) =>
                    value === 'actual'
                      ? 'Actual'
                      : value === 'projected'
                        ? 'Projected'
                        : value === 'goal'
                          ? 'Monthly goal'
                          : value
                  }
                />
                <Bar
                  dataKey="actual"
                  name="actual"
                  stackId="billings"
                  fill={ACTUAL_FILL}
                  fillOpacity={0.9}
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="projected"
                  name="projected"
                  stackId="billings"
                  fill={PROJECTED_FILL}
                  fillOpacity={0.85}
                  radius={[3, 3, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="goal"
                  name="goal"
                  stroke={GOAL_STROKE}
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {unpricedProjectCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            {unpricedProjectCount} project{unpricedProjectCount === 1 ? '' : 's'} excluded — no
            contract total: {unpricedProjects.map((p) => p.name).join(', ')}
          </p>
        ) : null}
      </div>
    </KpiCard>
  )
}

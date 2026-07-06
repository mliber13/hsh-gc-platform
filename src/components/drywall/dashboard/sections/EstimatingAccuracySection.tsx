import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  formatDashboardCurrency,
  formatDashboardPercent,
} from '@/lib/drywall/dashboardCalculations'
import {
  estimatingAccuracyColor,
  type EstimatingBucket,
} from '@/services/drywallDivisionAggregateService'
import { cn } from '@/lib/utils'
import { KpiCard } from '../ui/KpiCard'
import { StatusPill } from '../ui/StatusPill'
import { useDivisionExecution } from '../useDivisionExecution'

const ACCURACY_COLOR_CLASS = {
  green: 'text-emerald-600 dark:text-emerald-400',
  yellow: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
  neutral: 'text-muted-foreground',
} as const

const BAR_FILL = {
  green: 'hsl(142 76% 36%)',
  yellow: 'hsl(38 92% 50%)',
  red: 'hsl(0 72% 51%)',
  neutral: 'hsl(var(--muted-foreground))',
} as const

function formatVarianceHeadline(variancePct: number | null): string {
  if (variancePct == null) return '—'
  if (Math.abs(variancePct) < 0.005) return 'On estimate'
  const label = formatDashboardPercent(Math.abs(variancePct))
  return variancePct > 0 ? `${label} over estimate` : `${label} under estimate`
}

function formatSignedVariance(variancePct: number | null): string {
  if (variancePct == null) return '—'
  const sign = variancePct > 0 ? '+' : variancePct < 0 ? '−' : ''
  return `${sign}${formatDashboardPercent(Math.abs(variancePct))}`
}

function monthChartLabel(monthKey: string): string {
  try {
    return format(parseISO(`${monthKey}-01`), 'MMM yy')
  } catch {
    return monthKey
  }
}

function BucketVarianceRow({ bucket }: { bucket: EstimatingBucket }) {
  const color = estimatingAccuracyColor(bucket.variancePct)
  const magnitude = bucket.variancePct != null ? Math.abs(bucket.variancePct) : 0
  const barWidth = Math.min(100, magnitude * 100 * 2)

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{bucket.label}</span>
        <span className={cn('tabular-nums font-medium', ACCURACY_COLOR_CLASS[color])}>
          {formatSignedVariance(bucket.variancePct)}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="w-24 shrink-0 tabular-nums">
          Est {formatDashboardCurrency(bucket.est)}
        </span>
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="absolute inset-y-0 left-1/2 w-px bg-border"
            aria-hidden
          />
          <div
            className="absolute inset-y-0 rounded-full transition-all"
            style={{
              width: `${barWidth / 2}%`,
              left: bucket.variancePct != null && bucket.variancePct >= 0 ? '50%' : undefined,
              right: bucket.variancePct != null && bucket.variancePct < 0 ? '50%' : undefined,
              backgroundColor: BAR_FILL[color],
            }}
          />
        </div>
        <span className="w-24 shrink-0 text-right tabular-nums">
          Act {formatDashboardCurrency(bucket.actual)}
        </span>
      </div>
    </div>
  )
}

export function EstimatingAccuracySection() {
  const { accuracy, loading, error } = useDivisionExecution()
  const { overallVariancePct, jobCount, byBucket, byMonth, mostOff } = accuracy

  if (loading) {
    return (
      <KpiCard title="Estimating Accuracy" description="Estimate vs actual on completed jobs">
        <p className="text-sm text-muted-foreground">Loading estimating accuracy…</p>
      </KpiCard>
    )
  }

  if (error) {
    return (
      <KpiCard title="Estimating Accuracy" description="Estimate vs actual on completed jobs">
        <p className="text-sm text-destructive">{error}</p>
      </KpiCard>
    )
  }

  if (jobCount === 0) {
    return (
      <KpiCard
        title="Estimating Accuracy"
        description="Material + labor estimate vs actual (subs excluded) — last 12 months"
      >
        <p className="text-sm text-muted-foreground">
          No completed jobs with estimates in the last 12 months yet.
        </p>
      </KpiCard>
    )
  }

  const overallColor = estimatingAccuracyColor(overallVariancePct)
  const pillStatus =
    overallColor === 'neutral' ? null : (overallColor as 'green' | 'yellow' | 'red')

  const chartData = byMonth.map((row) => ({
    month: row.month,
    label: monthChartLabel(row.month),
    variancePct: row.variancePct != null ? row.variancePct * 100 : null,
    jobCount: row.jobCount,
    color: estimatingAccuracyColor(row.variancePct),
  }))

  return (
    <KpiCard
      title="Estimating Accuracy"
      description="Material + labor estimate vs actual on completed jobs — burden-inclusive, subs excluded"
      headerRight={
        pillStatus ? (
          <StatusPill
            status={pillStatus}
            label={formatVarianceHeadline(overallVariancePct)}
          />
        ) : null
      }
    >
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          <span className={cn('font-semibold text-foreground', ACCURACY_COLOR_CLASS[overallColor])}>
            {formatVarianceHeadline(overallVariancePct)}
          </span>
          {' · '}
          {jobCount} completed {jobCount === 1 ? 'job' : 'jobs'} (last 12 months)
        </p>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            By bucket
          </p>
          <div className="space-y-4">
            {byBucket.map((bucket) => (
              <BucketVarianceRow key={bucket.key} bucket={bucket} />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Variance trend — completion month
          </p>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v}%`}
                  width={40}
                />
                <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={2} />
                <Tooltip
                  formatter={(value) => {
                    const n = value == null ? null : Number(value)
                    if (n == null || !Number.isFinite(n)) return '—'
                    return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
                  }}
                  labelFormatter={(_, payload) => {
                    const row = payload?.[0]?.payload as (typeof chartData)[number] | undefined
                    if (!row) return ''
                    return `${row.label} · ${row.jobCount} ${row.jobCount === 1 ? 'job' : 'jobs'}`
                  }}
                />
                <Bar dataKey="variancePct" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.month}
                      fill={BAR_FILL[entry.color]}
                      fillOpacity={entry.variancePct == null ? 0.2 : 0.9}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {mostOff.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Most off — learn from
            </p>
            <ul className="divide-y rounded-lg border text-sm">
              {mostOff.map((job) => {
                const color = estimatingAccuracyColor(job.variancePct)
                return (
                  <li
                    key={job.projectId}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  >
                    <Link
                      to={`/drywall/projects/${job.projectId}/production`}
                      className="font-medium hover:underline"
                    >
                      {job.projectName}
                    </Link>
                    <span className="text-muted-foreground tabular-nums">
                      Est {formatDashboardCurrency(job.est)} · Act{' '}
                      {formatDashboardCurrency(job.actual)} ·{' '}
                      <span className={cn('font-medium', ACCURACY_COLOR_CLASS[color])}>
                        {formatSignedVariance(job.variancePct)}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </KpiCard>
  )
}

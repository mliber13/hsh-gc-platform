// ============================================================================
// Takeoff Accuracy — quoted sqft vs field-measured sqft
// ============================================================================
//
// This sits one step upstream of Estimating Accuracy and explains part of it. If a job is
// quoted at 10,000 sqft and measures 12,000, the material overrun is arithmetic — the
// takeoff was short, not the buying. Separating the two says which end to fix.
//
// Measured across the live data on 2026-10-02: takeoffs run HIGH. 42 of 54 judgeable jobs
// measured under their quoted sqft, weighted −8.5%, median −4.8%. Stable across every
// scoping rule tried, so it is a real tendency rather than an artifact of the filter.

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
  estimatingAccuracyColor,
  TAKEOFF_ACCURACY_MIN_SQFT,
  type TakeoffAccuracyJob,
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

const DESCRIPTION = 'Quoted sqft (with waste) vs field-measured sqft — last 12 months'

function formatSqft(sqft: number): string {
  return `${Math.round(sqft).toLocaleString()} sqft`
}

/**
 * One decimal, unlike `formatDashboardPercent` which rounds to whole points. The whole
 * finding here is a few points wide, so rounding -4.8% to -5% throws away the resolution
 * that makes it readable month to month.
 */
function formatSignedPct(variancePct: number | null): string {
  if (variancePct == null) return '—'
  const pct = variancePct * 100
  if (Math.abs(pct) < 0.05) return '0.0%'
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`
}

/** "ran 4.8% small" reads the way Mark talks about it; "−4.8% variance" does not. */
function formatHeadline(variancePct: number | null): string {
  if (variancePct == null) return 'Not enough measured jobs'
  const pct = Math.abs(variancePct * 100)
  if (pct < 0.5) return 'Takeoffs on the money'
  return variancePct > 0
    ? `Takeoffs run ${pct.toFixed(1)}% light`
    : `Takeoffs run ${pct.toFixed(1)}% heavy`
}

function monthChartLabel(monthKey: string): string {
  try {
    return format(parseISO(`${monthKey}-01`), 'MMM yy')
  } catch {
    return monthKey
  }
}

function JobRow({ job }: { job: TakeoffAccuracyJob }) {
  const color = estimatingAccuracyColor(job.variancePct)
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <Link
        to={`/drywall/projects/${job.projectId}/field`}
        className="font-medium hover:underline"
      >
        {job.projectName}
      </Link>
      <span className="tabular-nums text-muted-foreground">
        Quoted {formatSqft(job.quotedSqft)} · Measured {formatSqft(job.measuredSqft)} ·{' '}
        <span className={cn('font-medium', ACCURACY_COLOR_CLASS[color])}>
          {formatSignedPct(job.variancePct)}
        </span>
      </span>
    </li>
  )
}

export function TakeoffAccuracySection() {
  const { takeoffAccuracy, loading, error } = useDivisionExecution()
  const {
    overallVariancePct,
    medianVariancePct,
    jobCount,
    totalQuotedSqft,
    totalMeasuredSqft,
    overCount,
    underCount,
    byMonth,
    mostOff,
  } = takeoffAccuracy

  if (loading) {
    return (
      <KpiCard title="Takeoff Accuracy" description={DESCRIPTION}>
        <p className="text-sm text-muted-foreground">Loading takeoff accuracy…</p>
      </KpiCard>
    )
  }

  if (error) {
    return (
      <KpiCard title="Takeoff Accuracy" description={DESCRIPTION}>
        <p className="text-sm text-destructive">{error}</p>
      </KpiCard>
    )
  }

  if (jobCount === 0) {
    return (
      <KpiCard title="Takeoff Accuracy" description={DESCRIPTION}>
        <p className="text-sm text-muted-foreground">
          No jobs over {TAKEOFF_ACCURACY_MIN_SQFT.toLocaleString()} sqft with both a quote and
          a field measurement in the last 12 months.
        </p>
      </KpiCard>
    )
  }

  // Headline on the median, not the weighted figure: one partially-entered measurement on a
  // big job swings the weighted number hard, and there is at least one of those live.
  const headlineColor = estimatingAccuracyColor(medianVariancePct)
  const pillStatus =
    headlineColor === 'neutral' ? null : (headlineColor as 'green' | 'yellow' | 'red')

  const chartData = byMonth.map((row) => ({
    month: row.month,
    label: monthChartLabel(row.month),
    variancePct: row.variancePct != null ? row.variancePct * 100 : null,
    jobCount: row.jobCount,
    color: estimatingAccuracyColor(row.variancePct),
  }))

  return (
    <KpiCard
      title="Takeoff Accuracy"
      description={DESCRIPTION}
      headerRight={
        pillStatus ? (
          <StatusPill status={pillStatus} label={formatHeadline(medianVariancePct)} />
        ) : null
      }
    >
      <div className="space-y-6">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            <span
              className={cn('font-semibold text-foreground', ACCURACY_COLOR_CLASS[headlineColor])}
            >
              {formatHeadline(medianVariancePct)}
            </span>
            {' on the typical job · '}
            {jobCount} measured {jobCount === 1 ? 'job' : 'jobs'}
          </p>
          <p className="text-xs text-muted-foreground">
            {underCount} measured under the quote, {overCount} over. Across all of them,{' '}
            {formatSqft(totalQuotedSqft)} quoted against {formatSqft(totalMeasuredSqft)}{' '}
            measured — {formatSignedPct(overallVariancePct)} by volume.
          </p>
        </div>

        <div className="space-y-2">
          {/*
            "Saved", not "measured". The two differ: 14 older jobs carry a takeoff saved on
            2026-07-02, the day the division launched, because that is when they were keyed
            in — the walls were measured long before. Labelling the axis honestly is cheaper
            than explaining the July spike every time someone asks about it.
          */}
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Variance trend — month the takeoff was saved
          </p>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border/60"
                  vertical={false}
                />
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
              Furthest off — worth a look
            </p>
            <ul className="divide-y rounded-lg border text-sm">
              {mostOff.map((job) => (
                <JobRow key={job.projectId} job={job} />
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              A big gap is often a half-entered measurement rather than a bad takeoff — these
              link straight to the field measurement so you can tell which.
            </p>
          </div>
        ) : null}

        <p className="border-t pt-3 text-xs text-muted-foreground">
          Counts jobs over {TAKEOFF_ACCURACY_MIN_SQFT.toLocaleString()} sqft whose takeoff was
          saved in the last 12 months. Jobs whose measured sqft exactly equals the quote are
          left out — on those the quote was written from the takeoff, so there is nothing to
          compare. Months reflect when the takeoff was keyed in, which for jobs that predate
          the division is launch week rather than the day they were measured.
        </p>
      </div>
    </KpiCard>
  )
}

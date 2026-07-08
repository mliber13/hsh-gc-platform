import { useMemo } from 'react'
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
  computeFinancialsMetrics,
  formatDashboardCurrency,
  formatDashboardPercent,
} from '@/lib/drywall/dashboardCalculations'
import { BigStat } from '../ui/BigStat'
import { KpiCard } from '../ui/KpiCard'
import { StatusPill } from '../ui/StatusPill'
import { useDashboardData } from '../useDashboardData'
import { useDivisionExecution } from '../useDivisionExecution'

const GP_BAR_FILL = {
  green: 'hsl(142 76% 36%)',
  yellow: 'hsl(38 92% 50%)',
  red: 'hsl(0 72% 51%)',
  neutral: 'hsl(var(--muted-foreground))',
} as const

function gpBarColor(grossMarginPct: number | null): keyof typeof GP_BAR_FILL {
  if (grossMarginPct == null) return 'neutral'
  if (grossMarginPct >= 0.3) return 'green'
  if (grossMarginPct >= 0.25) return 'yellow'
  return 'red'
}

function formatMarginSublabel(jobCount: number, grossMarginPct: number | null): string {
  const jobs = `${jobCount} ${jobCount === 1 ? 'job' : 'jobs'} completed YTD`
  if (grossMarginPct == null) return jobs
  return `${jobs} · ${formatDashboardPercent(grossMarginPct)} gross margin`
}

export function FinancialsSection() {
  const { qbInvoices, loading: dashboardLoading, error: dashboardError } = useDashboardData()
  const { jobs, loading: executionLoading, error: executionError } = useDivisionExecution()

  const loading = dashboardLoading || executionLoading
  const error = dashboardError ?? executionError

  const metrics = useMemo(
    () => computeFinancialsMetrics(jobs, qbInvoices),
    [jobs, qbInvoices],
  )

  if (loading) {
    return (
      <KpiCard
        title="Financials"
        description="Realized gross profit on completed jobs · revenue from QB billings (contract value where unbilled)"
      >
        <p className="text-sm text-muted-foreground">Loading financials…</p>
      </KpiCard>
    )
  }

  if (error) {
    return (
      <KpiCard
        title="Financials"
        description="Realized gross profit on completed jobs · revenue from QB billings (contract value where unbilled)"
      >
        <p className="text-sm text-destructive">{error}</p>
      </KpiCard>
    )
  }

  const { ytd, mtd, arTotal, arAging, arAgingComplete, monthlyTrend, status } = metrics

  if (ytd.jobCount === 0) {
    return (
      <KpiCard
        title="Financials"
        description="Realized gross profit on completed jobs · revenue from QB billings (contract value where unbilled)"
        headerRight={<StatusPill status={status} />}
      >
        <p className="text-sm text-muted-foreground">
          No completed jobs yet this year — realized financials populate as jobs close.
        </p>
      </KpiCard>
    )
  }

  const chartData = monthlyTrend.map((row) => ({
    ...row,
    color: gpBarColor(row.grossMarginPct),
  }))

  return (
    <KpiCard
      title="Financials"
      description="Realized gross profit on completed jobs · revenue from QB billings (contract value where unbilled)"
      headerRight={<StatusPill status={status} />}
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <BigStat
            label="YTD Gross Profit"
            value={formatDashboardCurrency(ytd.grossProfit)}
            sublabel={formatMarginSublabel(ytd.jobCount, ytd.grossMarginPct)}
          />
          <BigStat
            label="MTD Gross Profit"
            value={formatDashboardCurrency(mtd.grossProfit)}
            sublabel={
              mtd.jobCount === 0
                ? 'No jobs completed this month'
                : `${mtd.jobCount} ${mtd.jobCount === 1 ? 'job' : 'jobs'} completed MTD · ${
                    mtd.grossMarginPct != null
                      ? `${formatDashboardPercent(mtd.grossMarginPct)} gross margin`
                      : '—'
                  }`
            }
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            YTD breakdown
          </p>
          <div className="rounded-lg border px-3 py-2 text-sm">
            <ul className="space-y-1.5 tabular-nums">
              <li className="flex justify-between gap-3">
                <span className="text-muted-foreground">Revenue</span>
                <span className="font-medium">{formatDashboardCurrency(ytd.revenue)}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-muted-foreground">Materials</span>
                <span>{formatDashboardCurrency(ytd.cogsMaterial)}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-muted-foreground">Labor</span>
                <span>{formatDashboardCurrency(ytd.cogsLabor)}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-muted-foreground">Subs</span>
                <span>{formatDashboardCurrency(ytd.cogsSub)}</span>
              </li>
              <li className="flex justify-between gap-3 border-t pt-1.5 font-medium">
                <span>COGS total</span>
                <span>{formatDashboardCurrency(ytd.cogsTotal)}</span>
              </li>
            </ul>
            {ytd.excludedNoRevenue > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {ytd.excludedNoRevenue} completed{' '}
                {ytd.excludedNoRevenue === 1 ? 'job' : 'jobs'} excluded (no billings or contract
                value)
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            AR aging
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {arAging.map((bucket) => (
              <div key={bucket.label} className="rounded-lg border bg-muted/20 px-3 py-2.5">
                <p className="text-xs text-muted-foreground">{bucket.label}</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">
                  {formatDashboardCurrency(bucket.amount)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {bucket.count} {bucket.count === 1 ? 'invoice' : 'invoices'}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <p className="text-xs text-muted-foreground">
              Aged by invoice date; due dates unavailable.
              {!arAgingComplete ? ' (some invoices undated)' : ''}
            </p>
            <p className="font-medium tabular-nums">
              AR total {formatDashboardCurrency(arTotal)}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Gross profit trend — {new Date().getFullYear()}
          </p>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
                <XAxis
                  dataKey="month"
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
                <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={2} />
                <Tooltip
                  formatter={(value) => {
                    const n = value == null ? null : Number(value)
                    if (n == null || !Number.isFinite(n)) return '—'
                    return formatDashboardCurrency(n)
                  }}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload as (typeof chartData)[number] | undefined
                    if (!row) return String(label)
                    const margin =
                      row.grossMarginPct != null
                        ? ` · ${formatDashboardPercent(row.grossMarginPct)} margin`
                        : ''
                    return `${row.month} ${new Date().getFullYear()}${margin}`
                  }}
                />
                <Bar dataKey="grossProfit" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.month} fill={GP_BAR_FILL[entry.color]} fillOpacity={0.9} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </KpiCard>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  formatDashboardCurrency,
  formatDashboardPercent,
} from '@/lib/drywall/dashboardCalculations'
import type {
  DivisionExecutionRollUp,
  DivisionMarginJob,
} from '@/services/drywallDivisionAggregateService'
import { cn } from '@/lib/utils'
import { BigStat } from '../ui/BigStat'
import { KpiCard } from '../ui/KpiCard'
import { StatusPill } from '../ui/StatusPill'
import { useDivisionExecution } from '../useDivisionExecution'

const TOP_JOBS_DEFAULT = 5

const MARGIN_COLOR_CLASS: Record<DivisionMarginJob['marginColor'], string> = {
  green: 'text-emerald-600 dark:text-emerald-400',
  yellow: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
  neutral: 'text-muted-foreground',
}

function marginPillStatus(
  color: DivisionMarginJob['marginColor'],
): 'green' | 'yellow' | 'red' | null {
  if (color === 'neutral') return null
  return color
}

function formatMarginPct(marginPct: number | null): string {
  if (marginPct == null) return '—'
  return formatDashboardPercent(marginPct)
}

function JobStatusBadge({ job }: { job: DivisionMarginJob }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        job.inProgress
          ? 'bg-sky-500/15 text-sky-800 dark:text-sky-200'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {job.inProgress ? 'In progress' : 'Completed'}
    </span>
  )
}

function DivisionHeadlineTiles({ data }: { data: DivisionExecutionRollUp }) {
  const marginValue =
    data.aggregateMarginUsd != null
      ? formatDashboardCurrency(data.aggregateMarginUsd)
      : '—'

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <BigStat
        label="Aggregate margin"
        value={marginValue}
        sublabel={
          data.aggregateMarginPct != null ? (
            <span className={cn('font-medium', MARGIN_COLOR_CLASS[data.aggregateMarginColor])}>
              {formatMarginPct(data.aggregateMarginPct)} · completed jobs
            </span>
          ) : (
            'Completed jobs with contract value'
          )
        }
      />
      <BigStat
        label="Total contract value"
        value={formatDashboardCurrency(data.totalBidCompleted)}
        sublabel="Completed only"
      />
      <BigStat
        label="Total actual"
        value={formatDashboardCurrency(data.totalActualCompleted)}
        sublabel="Material + labor + subs"
      />
      <BigStat
        label="Completed"
        value={String(data.completedCount)}
        sublabel="Jobs with final margin"
      />
      <BigStat
        label="In progress"
        value={String(data.inProgressCount)}
        sublabel="Actuals still accruing"
      />
    </div>
  )
}

function DivisionJobsTable({
  jobs,
  showAll,
}: {
  jobs: DivisionMarginJob[]
  showAll: boolean
}) {
  const visible = showAll ? jobs : jobs.slice(0, TOP_JOBS_DEFAULT)

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2.5">Job</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5 text-right">Contract</th>
            <th className="px-3 py-2.5 text-right">Actual</th>
            <th className="px-3 py-2.5 text-right">Margin %</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((job) => (
            <tr key={job.projectId} className="border-b last:border-0">
              <td className="px-3 py-2.5 align-top">
                <Link
                  to={`/drywall/projects/${job.projectId}/production`}
                  className="font-medium hover:underline"
                >
                  {job.projectName}
                </Link>
                {job.inProgress ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Running — actuals still accruing
                  </p>
                ) : null}
              </td>
              <td className="px-3 py-2.5 align-top">
                <JobStatusBadge job={job} />
              </td>
              <td className="px-3 py-2.5 text-right align-top tabular-nums text-muted-foreground">
                {job.bid != null && job.bid > 0 ? formatDashboardCurrency(job.bid) : '—'}
              </td>
              <td className="px-3 py-2.5 text-right align-top tabular-nums">
                {formatDashboardCurrency(job.totalActual)}
              </td>
              <td
                className={cn(
                  'px-3 py-2.5 text-right align-top font-medium tabular-nums',
                  MARGIN_COLOR_CLASS[job.marginColor],
                )}
              >
                {formatMarginPct(job.marginPct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DivisionMarginSection() {
  const { marginRollUp: data, loading, error } = useDivisionExecution()
  const [showAllJobs, setShowAllJobs] = useState(false)

  if (loading) {
    return (
      <KpiCard
        title="Division Execution"
        description="Contract value vs actual margin across in-scope jobs"
      >
        <p className="text-sm text-muted-foreground">Loading margin roll-up…</p>
      </KpiCard>
    )
  }

  if (error) {
    return (
      <KpiCard
        title="Division Execution"
        description="Contract value vs actual margin across in-scope jobs"
      >
        <p className="text-sm text-destructive">{error}</p>
      </KpiCard>
    )
  }

  const aggregatePill = marginPillStatus(data.aggregateMarginColor)

  if (data.jobs.length === 0) {
    return (
      <KpiCard
        title="Division Execution"
        description="Contract value vs actual margin across in-scope jobs"
      >
        <p className="text-sm text-muted-foreground">
          No production or completed jobs in scope yet.
        </p>
      </KpiCard>
    )
  }

  const hasMoreJobs = data.jobs.length > TOP_JOBS_DEFAULT

  return (
    <KpiCard
      title="Division Execution"
      description="Contract value vs actual cost (material + labor + subs) — burden-inclusive"
      headerRight={
        aggregatePill ? (
          <StatusPill
            status={aggregatePill}
            label={`${formatMarginPct(data.aggregateMarginPct)} margin`}
          />
        ) : (
          <span className="text-xs text-muted-foreground">No completed contract baseline</span>
        )
      }
    >
      <DivisionHeadlineTiles data={data} />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Jobs — worst margin first
        </p>
        <DivisionJobsTable jobs={data.jobs} showAll={showAllJobs} />
        {hasMoreJobs ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => setShowAllJobs((open) => !open)}
          >
            {showAllJobs ? (
              <>
                <ChevronUp className="mr-1.5 h-4 w-4" />
                Show top {TOP_JOBS_DEFAULT} only
              </>
            ) : (
              <>
                <ChevronDown className="mr-1.5 h-4 w-4" />
                Show all {data.jobs.length} jobs
              </>
            )}
          </Button>
        ) : null}
      </div>
    </KpiCard>
  )
}

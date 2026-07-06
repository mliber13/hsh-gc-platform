import { format, parseISO } from 'date-fns'
import {
  formatDashboardCurrency,
} from '@/lib/drywall/dashboardCalculations'
import { useDashboardData } from '../useDashboardData'
import { BigStat } from '../ui/BigStat'
import { KpiCard } from '../ui/KpiCard'
import { ProgressBar } from '../ui/ProgressBar'
import { StatusPill } from '../ui/StatusPill'

function formatScheduleDate(iso: string): string {
  try {
    return format(parseISO(iso), 'MMM d')
  } catch {
    return iso
  }
}

export function BacklogSection() {
  const { metrics } = useDashboardData()
  const { backlog } = metrics

  return (
    <KpiCard
      title="Backlog"
      description="Approved work in pipeline vs goal"
      headerRight={<StatusPill status={backlog.status} />}
    >
      <BigStat
        label="Current Backlog"
        value={formatDashboardCurrency(backlog.currentBacklog)}
        sublabel={`Goal ${formatDashboardCurrency(backlog.goalBacklog)}`}
      />

      <ProgressBar
        label="% of Goal"
        value={backlog.pctOfGoal}
        max={1}
        status={backlog.status}
      />

      <BigStat
        label="Months of Work Remaining"
        value={
          backlog.monthsRemaining != null
            ? backlog.monthsRemaining.toFixed(1)
            : '—'
        }
        sublabel="At current monthly capacity"
      />

      <div className="mt-auto grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Upcoming Starts ({backlog.upcomingStarts.length})
          </p>
          {backlog.upcomingStarts.length === 0 ? (
            <p className="text-xs text-muted-foreground">None in the next 30 days</p>
          ) : (
            <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
              {backlog.upcomingStarts.slice(0, 8).map((item) => (
                <li key={item.id}>
                  {formatScheduleDate(item.startDate)} — {item.projectName}: {item.name}
                </li>
              ))}
              {backlog.upcomingStarts.length > 8 ? (
                <li>+{backlog.upcomingStarts.length - 8} more</li>
              ) : null}
            </ul>
          )}
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Upcoming Completions ({backlog.upcomingCompletions.length})
          </p>
          {backlog.upcomingCompletions.length === 0 ? (
            <p className="text-xs text-muted-foreground">None in the next 30 days</p>
          ) : (
            <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
              {backlog.upcomingCompletions.slice(0, 8).map((item) => (
                <li key={item.id}>
                  {formatScheduleDate(item.endDate)} — {item.projectName}: {item.name}
                </li>
              ))}
              {backlog.upcomingCompletions.length > 8 ? (
                <li>+{backlog.upcomingCompletions.length - 8} more</li>
              ) : null}
            </ul>
          )}
        </div>
      </div>
    </KpiCard>
  )
}

import { format, parseISO } from 'date-fns'
import {
  formatDashboardCurrency,
  formatDashboardPercent,
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
      <div className="grid gap-4 sm:grid-cols-2">
        <BigStat label="Current Backlog" value={formatDashboardCurrency(backlog.currentBacklog)} />
        <BigStat label="Goal Backlog" value={formatDashboardCurrency(backlog.goalBacklog)} />
      </div>

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

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-medium">
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
        <div className="space-y-2">
          <p className="text-sm font-medium">
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

      <p className="text-xs text-muted-foreground">
        Backlog at {formatDashboardPercent(backlog.pctOfGoal)} of goal
      </p>
    </KpiCard>
  )
}

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ChevronRight, Info } from 'lucide-react'
import {
  computeDashboardAlerts,
  type DashboardAlertSeverity,
  type KpiStatus,
} from '@/lib/drywall/dashboardCalculations'
import { cn } from '@/lib/utils'
import { KpiCard } from '../ui/KpiCard'
import { StatusPill } from '../ui/StatusPill'
import { useDashboardData } from '../useDashboardData'
import { useDivisionExecution } from '../useDivisionExecution'

const SEVERITY_ICON: Record<
  DashboardAlertSeverity,
  typeof AlertTriangle
> = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
}

function headerStatus(criticalCount: number, warningCount: number): KpiStatus {
  if (criticalCount > 0) return 'red'
  if (warningCount > 0) return 'yellow'
  return 'green'
}

export function AlertsSection() {
  const {
    metrics,
    projects,
    scheduleItems,
    qbInvoices,
    targets,
    loading: dashboardLoading,
    error: dashboardError,
  } = useDashboardData()
  const {
    jobs,
    laborPerformance,
    accuracy,
    loading: executionLoading,
    error: executionError,
  } = useDivisionExecution()

  const loading = dashboardLoading || executionLoading
  const error = dashboardError ?? executionError

  const alerts = useMemo(
    () =>
      computeDashboardAlerts(
        metrics,
        { jobs, laborPerformance, accuracy },
        { projects, scheduleItems, qbInvoices, targets },
        new Date(),
      ),
    [metrics, jobs, laborPerformance, accuracy, projects, scheduleItems, qbInvoices, targets],
  )

  if (loading) {
    return (
      <KpiCard title="Alerts" description="What needs attention right now">
        <p className="text-sm text-muted-foreground">Loading alerts…</p>
      </KpiCard>
    )
  }

  if (error) {
    return (
      <KpiCard title="Alerts" description="What needs attention right now">
        <p className="text-sm text-destructive">{error}</p>
      </KpiCard>
    )
  }

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length
  const warningCount = alerts.filter((a) => a.severity === 'warning').length

  return (
    <KpiCard
      title="Alerts"
      description="Prioritized issues from pace, capacity, backlog, AR, and estimating"
      headerRight={
        criticalCount > 0 ? (
          <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300">
            {criticalCount} critical
          </span>
        ) : (
          <StatusPill status={headerStatus(criticalCount, warningCount)} />
        )
      }
    >
      {alerts.length === 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-3 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="font-medium text-emerald-800 dark:text-emerald-200">
            ✓ All clear — nothing needs attention.
          </p>
        </div>
      ) : (
        <ul className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2">
          {alerts.map((alert) => {
            const Icon = SEVERITY_ICON[alert.severity]
            const body = (
              <div className="flex h-full items-start gap-2.5 px-3 py-2.5">
                <Icon
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    alert.severity === 'critical' && 'text-rose-600 dark:text-rose-400',
                    alert.severity === 'warning' && 'text-amber-600 dark:text-amber-400',
                    alert.severity === 'info' && 'text-sky-600 dark:text-sky-400',
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug">{alert.title}</p>
                  <p className="text-xs leading-snug text-muted-foreground">{alert.detail}</p>
                </div>
                {alert.href ? (
                  <ChevronRight
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                ) : null}
              </div>
            )
            return (
              <li key={alert.id} className="bg-card">
                {alert.href ? (
                  <Link to={alert.href} className="block transition-colors hover:bg-muted/40">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            )
          })}
        </ul>
      )}
    </KpiCard>
  )
}

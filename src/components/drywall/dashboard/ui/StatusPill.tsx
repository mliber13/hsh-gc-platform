import { cn } from '@/lib/utils'
import type { KpiStatus } from '@/lib/drywall/dashboardCalculations'

const statusStyles: Record<KpiStatus, string> = {
  green: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  yellow: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  red: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
}

const statusLabels: Record<KpiStatus, string> = {
  green: 'On Track',
  yellow: 'Watch',
  red: 'At Risk',
}

type Props = {
  status: KpiStatus
  label?: string
  className?: string
}

export function StatusPill({ status, label, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        statusStyles[status],
        className,
      )}
    >
      {label ?? statusLabels[status]}
    </span>
  )
}

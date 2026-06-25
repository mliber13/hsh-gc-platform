import type { DrywallProjectListItem, DrywallProjectStatus } from '@/types/drywall'
import { isDrywallProjectClosed, normalizeDrywallProjectStatus } from '@/types/drywall'
import { cn } from '@/lib/utils'

const STAGE_CHIPS: {
  status: Exclude<DrywallProjectStatus, 'complete'>
  label: string
  chipClass: string
}[] = [
  { status: 'project-info', label: 'Info', chipClass: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  { status: 'quote', label: 'Quote', chipClass: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  {
    status: 'field-measurement',
    label: 'Field',
    chipClass: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  },
  { status: 'order', label: 'Order', chipClass: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200' },
  {
    status: 'production',
    label: 'Prod',
    chipClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
]

function formatPipelineCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function computeDrywallListStats(projects: DrywallProjectListItem[]) {
  const active = projects.filter((p) => !isDrywallProjectClosed(p.status))
  const quotePipeline = active.reduce((sum, p) => sum + (p.quoteTotal ?? 0), 0)
  const byStage: Record<string, number> = {
    'project-info': 0,
    quote: 0,
    'field-measurement': 0,
    order: 0,
    production: 0,
    'production-complete': 0,
  }
  for (const p of active) {
    const key = normalizeDrywallProjectStatus(p.status)
    if (key in byStage) byStage[key] += 1
    else byStage['project-info'] += 1
  }
  const completedCount = projects.filter((p) => isDrywallProjectClosed(p.status)).length
  return {
    quotePipeline,
    activeCount: active.length,
    byStage,
    completedCount,
  }
}

interface DrywallProjectsStatsStripProps {
  projects: DrywallProjectListItem[]
}

export function DrywallProjectsStatsStrip({ projects }: DrywallProjectsStatsStripProps) {
  const { quotePipeline, activeCount, byStage, completedCount } = computeDrywallListStats(projects)

  return (
    <div className="grid gap-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Quote pipeline</span>
        <p className="text-lg font-bold tabular-nums">{formatPipelineCurrency(quotePipeline)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Active projects only</p>
      </div>
      <div className="rounded-md bg-muted/40 p-3">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Active projects</span>
        <p className="text-lg font-bold tabular-nums">{activeCount}</p>
      </div>
      <div className="rounded-md bg-muted/40 p-3">
        <span className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
          By stage
        </span>
        <div className="flex flex-wrap gap-1.5">
          {STAGE_CHIPS.map(({ status, label, chipClass }) => (
            <span
              key={status}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums',
                chipClass,
              )}
            >
              {label}
              <span className="opacity-80">{byStage[status] ?? 0}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="rounded-md bg-muted/20 p-3 text-muted-foreground">
        <span className="text-xs uppercase tracking-wide">Completed this period</span>
        <p className="text-base font-semibold tabular-nums text-muted-foreground">{completedCount}</p>
      </div>
    </div>
  )
}

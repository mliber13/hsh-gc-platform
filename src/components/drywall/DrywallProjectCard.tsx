import type { MouseEvent } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { FileText, Info, Package, Ruler } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  listItemHasFieldData,
  listItemHasOrderData,
  listItemHasQuoteData,
} from '@/lib/drywall/listStageSignals'
import {
  DRYWALL_PROJECT_STATUSES,
  DRYWALL_STATUS_BADGE_LABELS,
  DRYWALL_STATUS_LABELS,
  isDrywallProjectClosed,
  normalizeDrywallProjectStatus,
  type DrywallProjectListItem,
  type DrywallProjectStatus,
} from '@/types/drywall'
import { cn } from '@/lib/utils'

export type DrywallProjectStage = 'project-info' | 'quote' | 'field-measurement' | 'order'

interface StatusVisual {
  bg: string
  text: string
  border: string
  dot: string
  rail: string
  label: string
}

const STATUS_VISUAL: Record<string, StatusVisual> = {
  'project-info': {
    bg: 'bg-sky-500/15',
    text: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-500/30',
    dot: 'bg-sky-500',
    rail: 'bg-sky-500',
    label: DRYWALL_STATUS_LABELS['project-info'],
  },
  quote: {
    bg: 'bg-violet-500/15',
    text: 'text-violet-700 dark:text-violet-300',
    border: 'border-violet-500/30',
    dot: 'bg-violet-500',
    rail: 'bg-violet-500',
    label: DRYWALL_STATUS_LABELS.quote,
  },
  'field-measurement': {
    bg: 'bg-rose-500/15',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-500/30',
    dot: 'bg-rose-500',
    rail: 'bg-rose-500',
    label: DRYWALL_STATUS_LABELS['field-measurement'],
  },
  order: {
    bg: 'bg-amber-500/15',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-500/30',
    dot: 'bg-amber-500',
    rail: 'bg-amber-500',
    label: DRYWALL_STATUS_LABELS.order,
  },
  production: {
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-500/30',
    dot: 'bg-emerald-500',
    rail: 'bg-emerald-500',
    label: DRYWALL_STATUS_LABELS.production,
  },
  'production-complete': {
    bg: 'bg-emerald-600/15',
    text: 'text-emerald-800 dark:text-emerald-200',
    border: 'border-emerald-600/30',
    dot: 'bg-emerald-600',
    rail: 'bg-emerald-600',
    label: DRYWALL_STATUS_LABELS['production-complete'],
  },
  closed: {
    bg: 'bg-slate-500/15',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-500/30',
    dot: 'bg-slate-500',
    rail: 'bg-slate-500',
    label: DRYWALL_STATUS_BADGE_LABELS.closed,
  },
  complete: {
    bg: 'bg-slate-500/15',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-500/30',
    dot: 'bg-slate-500',
    rail: 'bg-slate-500',
    label: DRYWALL_STATUS_BADGE_LABELS.closed,
  },
}

const STATUS_OPTIONS: { value: DrywallProjectStatus; label: string }[] =
  DRYWALL_PROJECT_STATUSES.map((value) => ({
    value,
    label: DRYWALL_STATUS_LABELS[value],
  }))

const STAGE_BUTTONS: {
  stage: DrywallProjectStage
  path: string
  label: string
  icon: typeof Info
  iconColor: string
  title: string
  emptyTooltip: string
  hasData: (project: DrywallProjectListItem) => boolean
}[] = [
  {
    stage: 'project-info',
    path: 'info',
    label: 'Info',
    icon: Info,
    iconColor: 'text-sky-500',
    title: 'Project info',
    emptyTooltip: '',
    hasData: () => true,
  },
  {
    stage: 'quote',
    path: 'quote',
    label: 'Quote',
    icon: FileText,
    iconColor: 'text-violet-500',
    title: 'Quote',
    emptyTooltip: 'Quote not started yet',
    hasData: listItemHasQuoteData,
  },
  {
    stage: 'field-measurement',
    path: 'field',
    label: 'Field',
    icon: Ruler,
    iconColor: 'text-rose-500',
    title: 'Field measurement',
    emptyTooltip: 'Field measurement not started yet',
    hasData: listItemHasFieldData,
  },
  {
    stage: 'order',
    path: 'order',
    label: 'Order',
    icon: Package,
    iconColor: 'text-amber-500',
    title: 'Order',
    emptyTooltip: 'No orders yet',
    hasData: listItemHasOrderData,
  },
]

function statusVisual(status: string): StatusVisual {
  const key = normalizeDrywallProjectStatus(status)
  return STATUS_VISUAL[key] ?? STATUS_VISUAL['project-info']
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatSqft(sqft: number | null): string {
  if (sqft == null || sqft <= 0) return '—'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(sqft)
}

function formatQuoteTotal(total: number | null): string {
  if (total == null || total <= 0) return '—'
  return formatCurrency(total)
}

export interface DrywallProjectCardProps {
  project: DrywallProjectListItem
  onSelect: (project: DrywallProjectListItem) => void
  statusMenuOpen: boolean
  onToggleStatusMenu: () => void
  onChangeStatus: (project: DrywallProjectListItem, status: DrywallProjectStatus) => void
  isUpdatingStatus: boolean
  isViewer: boolean
  showReopen?: boolean
  onReopen?: (project: DrywallProjectListItem) => void
}

export function DrywallProjectCard({
  project,
  onSelect,
  statusMenuOpen,
  onToggleStatusMenu,
  onChangeStatus,
  isUpdatingStatus,
  isViewer,
  showReopen = false,
  onReopen,
}: DrywallProjectCardProps) {
  const status = statusVisual(project.status)
  const sqftTone = project.sqft != null && project.sqft > 0 ? 'default' : 'muted'
  const quoteTone = project.quoteTotal != null && project.quoteTotal > 0 ? 'default' : 'muted'

  const handleCardClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('[data-quick-jump], button, a')) return
    onSelect(project)
  }

  return (
    <Card
      onClick={handleCardClick}
      className="group cursor-pointer overflow-hidden border-border/60 bg-card/50 transition-colors hover:bg-card"
    >
      <CardContent className="flex items-stretch p-0">
        <div className={cn('w-1 shrink-0', status.rail)} aria-hidden />

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold">{project.name}</h3>
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isViewer) return
                      onToggleStatusMenu()
                    }}
                    disabled={isUpdatingStatus}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-opacity',
                      status.bg,
                      status.text,
                      status.border,
                      !isViewer && 'cursor-pointer hover:opacity-80',
                      isViewer && 'cursor-default',
                      isUpdatingStatus && 'opacity-60',
                    )}
                    title={isViewer ? undefined : 'Change status'}
                  >
                    <span className={cn('size-1.5 rounded-full', status.dot)} />
                    {isUpdatingStatus ? '…' : status.label}
                  </button>
                  {statusMenuOpen && (
                    <div
                      className="absolute left-0 top-full z-20 mt-1 min-w-[160px] rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-md"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => onChangeStatus(project, opt.value)}
                          className={cn(
                            'block w-full px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                            project.status === opt.value && 'bg-accent/50 font-medium',
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {project.client && (
                <p className="truncate text-sm text-muted-foreground">{project.client}</p>
              )}
              {project.address && (
                <p className="truncate text-sm text-muted-foreground">{project.address}</p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground/70">
                Updated {formatDistanceToNow(project.updatedAt, { addSuffix: true })}
              </p>
            </div>

            <div className="flex flex-col items-end gap-2 lg:shrink-0">
              <div className="flex items-baseline gap-6 text-right">
                <FinancialColumn
                  label="Sqft"
                  value={formatSqft(project.sqft)}
                  tone={sqftTone}
                />
                <FinancialColumn
                  label="Quote total"
                  value={formatQuoteTotal(project.quoteTotal)}
                  tone={quoteTone}
                />
              </div>
              {showReopen && isDrywallProjectClosed(project.status) && onReopen && !isViewer && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onReopen(project)
                  }}
                >
                  Reopen
                </Button>
              )}
            </div>
          </div>

          <div
            data-quick-jump
            className="flex flex-wrap items-center gap-1 border-t border-border/40 pt-3"
            onClick={(e) => e.stopPropagation()}
          >
            {STAGE_BUTTONS.map(
              ({ path, label, icon: Icon, iconColor, title, emptyTooltip, hasData }) => {
                const stageHasData = hasData(project)
                return (
                  <Button
                    key={path}
                    asChild
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-xs hover:bg-muted"
                  >
                    <Link
                      to={`/drywall/projects/${project.id}/${path}`}
                      title={stageHasData ? title : emptyTooltip}
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        'inline-flex items-center gap-1.5',
                        stageHasData
                          ? 'font-medium text-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      <Icon
                        className={cn('size-4', stageHasData ? iconColor : 'text-muted-foreground')}
                      />
                      {label}
                    </Link>
                  </Button>
                )
              },
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function FinancialColumn({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'default' | 'muted'
}) {
  return (
    <div className="min-w-[5.5rem] text-right">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
        {label}
      </p>
      <p
        className={cn(
          'text-sm font-semibold tabular-nums',
          tone === 'muted' ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {value}
      </p>
    </div>
  )
}

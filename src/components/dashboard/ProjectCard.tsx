// ============================================================================
// ProjectCard — dashboard list row for a single project
// ============================================================================
//
// Adapted from the v0 export's components/project-card.tsx, wired to our
// existing Project type + permissions + status inline-edit. Layout kept
// 1:1 with the legacy ProjectsDashboard rows so information density doesn't
// regress: project name + status pill + meta line, 6 quick-action buttons,
// 3 financial columns (Base / Est. / Actual).
//
// Status pill colors per docs/DESIGN_LANGUAGE.md spec:
//   estimating  → violet    bidding  → amber
//   in-progress → emerald   awarded  → sky
//   complete    → sky       (else)   → muted
//

import {
  BookMarked,
  BookOpen,
  Calendar,
  ClipboardList,
  DollarSign,
  FileText,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Project, ProjectStatus } from '@/types'
import { cn } from '@/lib/utils'

export type ProjectSection =
  | 'estimate'
  | 'actuals'
  | 'change-orders'
  | 'documents'
  | 'selection-book'
  | 'schedule'
  | 'forms'

export interface ProjectWithStats extends Project {
  basePriceTotal?: number
  estimatedValue?: number
  actualCosts?: number
  tradeCount?: number
}

interface StatusVisual {
  bg: string
  text: string
  border: string
  dot: string
  rail: string
  label: string
}

function statusVisual(status: string): StatusVisual {
  switch (status) {
    case 'estimating':
      return {
        bg: 'bg-violet-500/15',
        text: 'text-violet-400',
        border: 'border-violet-500/30',
        dot: 'bg-violet-500',
        rail: 'bg-violet-500',
        label: 'Estimating',
      }
    case 'bidding':
      return {
        bg: 'bg-amber-500/15',
        text: 'text-amber-500',
        border: 'border-amber-500/30',
        dot: 'bg-amber-500',
        rail: 'bg-amber-500',
        label: 'Bidding',
      }
    case 'awarded':
      return {
        bg: 'bg-sky-500/15',
        text: 'text-sky-500',
        border: 'border-sky-500/30',
        dot: 'bg-sky-500',
        rail: 'bg-sky-500',
        label: 'Awarded',
      }
    case 'in-progress':
      return {
        bg: 'bg-emerald-500/15',
        text: 'text-emerald-500',
        border: 'border-emerald-500/30',
        dot: 'bg-emerald-500',
        rail: 'bg-emerald-500',
        label: 'In Progress',
      }
    case 'complete':
      return {
        bg: 'bg-sky-500/15',
        text: 'text-sky-500',
        border: 'border-sky-500/30',
        dot: 'bg-sky-500',
        rail: 'bg-sky-500',
        label: 'Complete',
      }
    default:
      return {
        bg: 'bg-muted',
        text: 'text-muted-foreground',
        border: 'border-border',
        dot: 'bg-muted-foreground',
        rail: 'bg-muted-foreground',
        label: status,
      }
  }
}

const SECTION_BUTTONS: {
  section: ProjectSection
  label: string
  icon: typeof BookOpen
  title: string
}[] = [
  { section: 'estimate', label: 'Estimate', icon: BookOpen, title: 'Estimate book' },
  { section: 'actuals', label: 'Actuals', icon: DollarSign, title: 'Project actuals' },
  { section: 'schedule', label: 'Schedule', icon: Calendar, title: 'Schedule' },
  { section: 'selection-book', label: 'Selection', icon: BookMarked, title: 'Selection book' },
  { section: 'documents', label: 'Docs', icon: FileText, title: 'Project documents' },
  { section: 'change-orders', label: 'COs', icon: ClipboardList, title: 'Change orders' },
]

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'estimating', label: 'Estimating' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'complete', label: 'Complete' },
]

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

function addressLine(project: Project): string {
  const parts: string[] = []
  const street =
    typeof project.address === 'string'
      ? project.address
      : project.address?.street
  if (street) parts.push(street)
  const cityState = [project.city, project.state].filter(Boolean).join(', ')
  if (cityState) parts.push(cityState)
  return parts.join(' · ') || 'No address'
}

function planLine(project: ProjectWithStats): string {
  const parts: string[] = []
  if (project.metadata?.isCustomPlan || !project.metadata?.planId) {
    parts.push('Custom plan')
  } else {
    parts.push(`Plan: ${project.metadata.planId}`)
  }
  parts.push(project.createdAt.toLocaleDateString())
  if (project.tradeCount && project.tradeCount > 0) {
    parts.push(`${project.tradeCount} items`)
  }
  return parts.join(' · ')
}

interface ProjectCardProps {
  project: ProjectWithStats
  onSelect: (project: ProjectWithStats) => void
  onOpenSection?: (project: ProjectWithStats, section: ProjectSection) => void
  /** Status inline-edit dropdown */
  statusMenuOpen: boolean
  onToggleStatusMenu: () => void
  onChangeStatus: (project: ProjectWithStats, status: ProjectStatus) => void
  isUpdatingStatus: boolean
  isViewer: boolean
}

export function ProjectCard({
  project,
  onSelect,
  onOpenSection,
  statusMenuOpen,
  onToggleStatusMenu,
  onChangeStatus,
  isUpdatingStatus,
  isViewer,
}: ProjectCardProps) {
  const status = statusVisual(project.status)
  const base = project.basePriceTotal ?? 0
  const est = project.estimatedValue ?? 0
  const actual = project.actualCosts ?? 0

  return (
    <Card
      onClick={() => onSelect(project)}
      className="group cursor-pointer overflow-hidden border-border/60 bg-card/50 transition-colors hover:bg-card"
    >
      <CardContent className="flex items-stretch p-0">
        {/* Status rail (left edge) */}
        <div className={cn('w-1 shrink-0', status.rail)} aria-hidden />

        <div className="flex flex-1 flex-col gap-3 p-4 lg:flex-row lg:items-center lg:gap-4">
          {/* Project info: name + status pill + address + plan line */}
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
                    className="absolute left-0 top-full z-20 mt-1 min-w-[140px] rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-md"
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
            <p className="truncate text-sm text-muted-foreground">
              {addressLine(project)}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground/70">
              {planLine(project)}
            </p>
          </div>

          {/* Quick actions (md+ inline; mobile shows below) */}
          {onOpenSection && (
            <div
              className="flex flex-wrap items-center gap-1 lg:shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {SECTION_BUTTONS.map(({ section, label, icon: Icon, title }) => (
                <Button
                  key={section}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenSection(project, section)}
                  title={title}
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Icon className="size-3.5" />
                  {label}
                </Button>
              ))}
            </div>
          )}

          {/* Financial summary (3 columns) */}
          <div className="flex items-baseline gap-6 text-right lg:shrink-0">
            <FinancialColumn
              label="Base"
              value={formatCurrency(base)}
              tone="base"
            />
            <FinancialColumn
              label="Est."
              value={formatCurrency(est)}
              tone="default"
            />
            <FinancialColumn
              label="Actual"
              value={formatCurrency(actual)}
              tone={actual > 0 ? 'actual' : 'muted'}
            />
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
  tone: 'base' | 'default' | 'actual' | 'muted'
}) {
  const toneClass =
    tone === 'base'
      ? 'text-sky-600 dark:text-sky-400'
      : tone === 'actual'
        ? 'text-emerald-600 dark:text-emerald-400'
        : tone === 'muted'
          ? 'text-muted-foreground'
          : 'text-foreground'
  return (
    <div className="min-w-[5.5rem] text-center">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
        {label}
      </p>
      <p className={cn('text-sm font-semibold tabular-nums', toneClass)}>{value}</p>
    </div>
  )
}

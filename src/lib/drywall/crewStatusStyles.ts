import { DRYWALL_STATUS_BADGE_LABELS, normalizeDrywallProjectStatus } from '@/types/drywall'
import { cn } from '@/lib/utils'

const STATUS_PILL: Record<string, { bg: string; text: string; border: string; label: string }> = {
  'project-info': {
    bg: 'bg-sky-500/15',
    text: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-500/30',
    label: DRYWALL_STATUS_BADGE_LABELS['project-info'],
  },
  quote: {
    bg: 'bg-violet-500/15',
    text: 'text-violet-700 dark:text-violet-300',
    border: 'border-violet-500/30',
    label: DRYWALL_STATUS_BADGE_LABELS.quote,
  },
  'field-measurement': {
    bg: 'bg-rose-500/15',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-500/30',
    label: DRYWALL_STATUS_BADGE_LABELS['field-measurement'],
  },
  order: {
    bg: 'bg-amber-500/15',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-500/30',
    label: DRYWALL_STATUS_BADGE_LABELS.order,
  },
  production: {
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-500/30',
    label: DRYWALL_STATUS_BADGE_LABELS.production,
  },
  'production-complete': {
    bg: 'bg-emerald-600/15',
    text: 'text-emerald-800 dark:text-emerald-200',
    border: 'border-emerald-600/30',
    label: DRYWALL_STATUS_BADGE_LABELS['production-complete'],
  },
  closed: {
    bg: 'bg-slate-500/15',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-500/30',
    label: DRYWALL_STATUS_BADGE_LABELS.closed,
  },
}

export function drywallStatusPillClass(status: string | null | undefined): string {
  const key = normalizeDrywallProjectStatus(status)
  const visual = STATUS_PILL[key] ?? STATUS_PILL.closed
  return cn(
    'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium',
    visual.bg,
    visual.text,
    visual.border,
  )
}

export function drywallStatusLabel(status: string | null | undefined): string {
  const key = normalizeDrywallProjectStatus(status)
  return STATUS_PILL[key]?.label ?? DRYWALL_STATUS_BADGE_LABELS.closed
}

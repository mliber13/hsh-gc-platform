// ============================================================================
// KpiTile — the one-glance form of a KPI section
// ============================================================================
//
// Renders in two shapes from the same inputs, because the overview and the open state need
// the same facts at different sizes:
//
//   tile — the overview grid. Title, headline figure, caption.
//   chip — the strip above an open detail, so switching KPI is one click.
//
// Both are links rather than buttons: the open section is a route, so middle-click, Back and
// a copied URL all behave the way the rest of the app does.
//
// The figure carries the status colour and there is no separate pill. A tile is small enough
// that a coloured number and a coloured badge saying the same thing is noise.

import { Link } from 'react-router-dom'
import type { KpiStatus } from '@/lib/drywall/dashboardCalculations'
import { cn } from '@/lib/utils'

export type KpiTileVariant = 'tile' | 'chip'

export interface SectionSummaryProps {
  variant: KpiTileVariant
  /** True when this is the section currently open below the strip. */
  active: boolean
  /** Route for the open state, or the hub root when this tile is the open one. */
  to: string
}

type Props = SectionSummaryProps & {
  title: string
  /** The headline figure. Null renders an em dash rather than a blank tile. */
  value: string | null
  /** What the figure is of — "of monthly goal", "run heavy". Omitted on chips. */
  caption?: string
  status?: KpiStatus | null
  loading?: boolean
}

const VALUE_COLOR: Record<KpiStatus, string> = {
  green: 'text-emerald-600 dark:text-emerald-400',
  yellow: 'text-amber-600 dark:text-amber-400',
  red: 'text-rose-600 dark:text-rose-400',
}

function valueClass(status: KpiStatus | null | undefined): string {
  return status ? VALUE_COLOR[status] : 'text-foreground'
}

export function KpiTile({
  variant,
  active,
  to,
  title,
  value,
  caption,
  status,
  loading = false,
}: Props) {
  const shown = loading ? null : value

  if (variant === 'chip') {
    return (
      <Link
        to={to}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
          active
            ? 'border-primary bg-primary/10 text-foreground'
            : 'border-border bg-card/50 text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        )}
      >
        <span className="whitespace-nowrap">{title}</span>
        <span className={cn('font-medium tabular-nums', valueClass(status))}>{shown ?? '—'}</span>
      </Link>
    )
  }

  return (
    <Link
      to={to}
      className={cn(
        'group flex flex-col rounded-xl border bg-card p-3 transition-colors',
        'hover:border-primary/40 hover:bg-muted/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <span className="truncate text-xs text-muted-foreground">{title}</span>
      <span className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        {loading ? (
          <span className="my-1 inline-block h-5 w-16 animate-pulse rounded bg-muted" />
        ) : (
          <span className={cn('text-xl font-medium tabular-nums', valueClass(status))}>
            {shown ?? '—'}
          </span>
        )}
        {caption && !loading ? (
          <span className="text-[11px] text-muted-foreground">{caption}</span>
        ) : null}
      </span>
    </Link>
  )
}

import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/components/hr/payroll/payrollFormat'
import type { MarginVsBidResult } from '@/lib/drywall/projectCostMath'
import { cn } from '@/lib/utils'

const MARGIN_COLOR_CLASS: Record<MarginVsBidResult['marginColor'], string> = {
  green: 'text-emerald-600 dark:text-emerald-400',
  yellow: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
  neutral: 'text-foreground',
}

function CostTileShell({
  title,
  icon: Icon,
  value,
  caption,
  subline,
  valueClassName,
}: {
  title: string
  icon: LucideIcon
  value: string
  caption?: string
  subline?: string
  valueClassName?: string
}) {
  return (
    <Card className="flex-1 min-w-[140px]">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={cn('text-2xl font-semibold tabular-nums', valueClassName)}>{value}</p>
        {subline && <p className="text-xs text-muted-foreground mt-1">{subline}</p>}
        {caption && <p className="text-xs text-muted-foreground mt-1">{caption}</p>}
      </CardContent>
    </Card>
  )
}

export function RunningCostTile({
  icon,
  labor,
  material,
  sub,
  total,
}: {
  icon: LucideIcon
  labor: number
  material: number
  sub: number
  total: number
}) {
  return (
    <CostTileShell
      title="Running Cost"
      icon={icon}
      value={formatCurrency(total)}
      caption="Labor + Material + Sub"
      subline={`Labor: ${formatCurrency(labor)} · Material: ${formatCurrency(material)} · Sub: ${formatCurrency(sub)}`}
    />
  )
}

export function MarginVsBidTile({
  icon,
  margin,
  bidTotal,
  costTotal,
}: {
  icon: LucideIcon
  margin: MarginVsBidResult
  bidTotal: number | null
  costTotal: number
}) {
  if (margin.marginPct == null) {
    return (
      <CostTileShell
        title="Margin vs Bid"
        icon={icon}
        value="—"
        caption="No bid baseline"
      />
    )
  }

  return (
    <CostTileShell
      title="Margin vs Bid"
      icon={icon}
      value={`${(margin.marginPct * 100).toFixed(1)}%`}
      valueClassName={MARGIN_COLOR_CLASS[margin.marginColor]}
      subline={
        bidTotal != null
          ? `Bid ${formatCurrency(bidTotal)} • Cost ${formatCurrency(costTotal)}`
          : undefined
      }
    />
  )
}

export function CurrentCrewTile({
  icon,
  crew,
}: {
  icon: LucideIcon
  crew: { names: string[]; total: number }
}) {
  const display =
    crew.names.length > 0
      ? crew.names.join(', ')
      : '—'
  const overflow = crew.total > crew.names.length ? `+${crew.total - crew.names.length} more` : null

  return (
    <CostTileShell
      title="Current Crew"
      icon={icon}
      value={display}
      caption={overflow ? `${overflow} · Latest pay period` : 'Latest pay period'}
    />
  )
}

export function FinalTotalCostTile({
  icon,
  total,
  live,
}: {
  icon: LucideIcon
  total: number
  live: boolean
}) {
  return (
    <CostTileShell
      title="Final Total Cost"
      icon={icon}
      value={formatCurrency(total)}
      caption={live ? 'Live recompute' : 'As of closeout'}
    />
  )
}

export function AfterProductionCostTile({
  icon,
  cost,
  finalTotal,
}: {
  icon: LucideIcon
  cost: number | null
  finalTotal: number | null
}) {
  if (cost == null) {
    return (
      <CostTileShell
        title="After-Production Cost"
        icon={icon}
        value="—"
        caption="Production not complete yet"
      />
    )
  }

  const pct =
    finalTotal != null && finalTotal > 0
      ? `${((cost / finalTotal) * 100).toFixed(1)}% of final total`
      : undefined

  return (
    <CostTileShell
      title="After-Production Cost"
      icon={icon}
      value={formatCurrency(cost)}
      caption={pct}
    />
  )
}

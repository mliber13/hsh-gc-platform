import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/components/hr/payroll/payrollFormat'
import type { EstimatedMaterialBreakdown } from '@/lib/drywall/estimatedMaterial'
import type { MarginVsBidResult, MaterialEntryFlat } from '@/lib/drywall/projectCostMath'
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
  billedToDate,
}: {
  icon: LucideIcon
  margin: MarginVsBidResult
  bidTotal: number | null
  costTotal: number
  billedToDate?: number
}) {
  const billedCaption =
    billedToDate != null && billedToDate > 0
      ? bidTotal != null && bidTotal > 0
        ? `Billed to date (QB): ${formatCurrency(billedToDate)} (${((billedToDate / bidTotal) * 100).toFixed(1)}% of bid)`
        : `Billed to date (QB): ${formatCurrency(billedToDate)}`
      : undefined

  if (margin.marginPct == null) {
    return (
      <CostTileShell
        title="Margin vs Bid"
        icon={icon}
        value="—"
        caption={billedCaption ?? 'No bid baseline'}
        subline={billedCaption ? 'No bid baseline' : undefined}
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
      caption={billedCaption}
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

function formatMaterialEntryDate(iso: string): string {
  if (!iso || iso.length < 10) return '—'
  try {
    const d = new Date(`${iso.slice(0, 10)}T12:00:00`)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso.slice(0, 10)
  }
}

function actualEntryLabel(entry: MaterialEntryFlat): string {
  const vendor = entry.vendor?.trim()
  const desc = entry.description?.trim()
  if (vendor && desc) return `${vendor} · ${desc}`
  return vendor || desc || 'Material'
}

export function EstimatedVsActualMaterialTile({
  icon: Icon,
  estimated,
  actual,
}: {
  icon: LucideIcon
  estimated: EstimatedMaterialBreakdown
  actual: { totalCost: number; entries: MaterialEntryFlat[] }
}) {
  const estimatedTotal = estimated.totalWithTax
  const actualTotal = actual.totalCost
  const variance = actualTotal - estimatedTotal
  const variancePct = estimatedTotal > 0 ? (variance / estimatedTotal) * 100 : null
  const hasEstimate = estimatedTotal > 0 || estimated.components.length > 0
  const isOver = variance > 0.005
  const isUnder = variance < -0.005

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
          <Icon className="h-4 w-4 text-muted-foreground" />
          Estimated vs Actual Material
          {hasEstimate ? (
            <span
              className={cn(
                'ml-auto inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium',
                isOver
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                  : isUnder
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
              )}
            >
              {isOver ? 'Over estimate' : isUnder ? 'Under estimate' : 'On estimate'}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasEstimate ? (
          <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border bg-muted/20 px-4 py-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Estimated (w/ tax)</p>
              <p className="text-lg font-semibold tabular-nums">{formatCurrency(estimatedTotal)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Actual purchased</p>
              <p className="text-lg font-semibold tabular-nums">{formatCurrency(actualTotal)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Variance</p>
              <p
                className={cn(
                  'text-lg font-semibold tabular-nums',
                  isOver && 'text-amber-700 dark:text-amber-300',
                  isUnder && 'text-emerald-700 dark:text-emerald-300',
                )}
              >
                {variance >= 0 ? '+' : ''}
                {formatCurrency(variance)}
                {variancePct != null ? ` (${variancePct >= 0 ? '+' : ''}${variancePct.toFixed(1)}%)` : ''}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No quote material estimate — complete the quote to compare against purchased materials.
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Estimated breakdown
            </p>
            <p className="text-xs text-muted-foreground">
              Components shown pre-tax; total includes sales tax
            </p>
            {hasEstimate ? (
              <div className="rounded-lg border px-3 py-2 text-sm">
                <ul className="space-y-1">
                  {estimated.components.map((row) => (
                    <li key={row.key} className="flex justify-between gap-3 tabular-nums">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span>{formatCurrency(row.amount)}</span>
                    </li>
                  ))}
                  {estimated.salesTax > 0 ? (
                    <li className="flex justify-between gap-3 tabular-nums">
                      <span className="text-muted-foreground">Sales tax</span>
                      <span>{formatCurrency(estimated.salesTax)}</span>
                    </li>
                  ) : null}
                </ul>
                <div className="mt-2 flex justify-between gap-3 border-t pt-2 font-medium tabular-nums">
                  <span>Total (est.)</span>
                  <span>{formatCurrency(estimatedTotal)}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Actual itemized
            </p>
            {actual.entries.length > 0 ? (
              <div className="max-h-64 overflow-y-auto rounded-lg border px-3 py-2 text-sm">
                <ul className="space-y-1.5">
                  {actual.entries.map((entry) => (
                    <li key={entry.id} className="flex justify-between gap-3 tabular-nums">
                      <span className="min-w-0 text-muted-foreground">
                        <span className="text-foreground">{formatMaterialEntryDate(entry.date)}</span>
                        {' · '}
                        <span className="break-words">{actualEntryLabel(entry)}</span>
                      </span>
                      <span className="shrink-0">{formatCurrency(entry.amount)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex justify-between gap-3 border-t pt-2 font-medium tabular-nums">
                  <span>Total (actual)</span>
                  <span>{formatCurrency(actualTotal)}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No material purchases recorded yet (sync QuickBooks materials or add entries).
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/components/hr/payroll/payrollFormat'
import {
  componentLaborLabel,
  type EstimatedLaborBreakdown,
} from '@/lib/drywall/estimatedLabor'
import {
  componentEstimateKeyFromPieceKey,
  resolvePieceEntryKey,
  type DrywallLaborCategory,
} from '@/lib/drywall/payrollPieceKeys'
import type { EstimatedMaterialBreakdown } from '@/lib/drywall/estimatedMaterial'
import type {
  DrywallProjectLaborEntryFlat,
  DrywallProjectLaborSummary,
} from '@/lib/drywall/projectLaborMath'
import type { MarginVsBidResult, MaterialEntryFlat } from '@/lib/drywall/projectCostMath'
import { cn } from '@/lib/utils'
import { LaborBreakdownModal } from './LaborBreakdownModal'

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
  w2BurdenCost,
}: {
  icon: LucideIcon
  labor: number
  material: number
  sub: number
  total: number
  w2BurdenCost?: number
}) {
  const laborPart =
    w2BurdenCost != null && w2BurdenCost > 0
      ? `Labor: ${formatCurrency(labor)} (incl. ${formatCurrency(w2BurdenCost)} W2 burden)`
      : `Labor: ${formatCurrency(labor)}`

  return (
    <CostTileShell
      title="Running Cost"
      icon={icon}
      value={formatCurrency(total)}
      caption="Labor + Material + Sub"
      subline={`${laborPart} · Material: ${formatCurrency(material)} · Sub: ${formatCurrency(sub)}`}
    />
  )
}

export function MarginVsBidTile({
  icon,
  margin,
  contractTotal,
  costTotal,
  billedToDate,
  remainingToBill,
  overbilledAmount,
}: {
  icon: LucideIcon
  margin: MarginVsBidResult
  contractTotal: number | null
  costTotal: number
  billedToDate?: number
  remainingToBill?: number | null
  overbilledAmount?: number
}) {
  const billedCaption =
    overbilledAmount != null && overbilledAmount > 0
      ? `Billed ${formatCurrency(overbilledAmount)} over contract`
      : billedToDate != null && billedToDate > 0
      ? contractTotal != null && contractTotal > 0
        ? `Billed (QB): ${formatCurrency(billedToDate)} • Remaining: ${formatCurrency(remainingToBill ?? 0)}`
        : `Billed to date (QB): ${formatCurrency(billedToDate)}`
      : undefined

  if (margin.marginPct == null) {
    return (
      <CostTileShell
        title="Margin vs Contract"
        icon={icon}
        value="—"
        caption={billedCaption ?? 'No contract baseline'}
        subline={billedCaption ? 'No contract baseline' : undefined}
      />
    )
  }

  return (
    <CostTileShell
      title="Margin vs Contract"
      icon={icon}
      value={`${(margin.marginPct * 100).toFixed(1)}%`}
      valueClassName={MARGIN_COLOR_CLASS[margin.marginColor]}
      subline={
        contractTotal != null
          ? `Contract ${formatCurrency(contractTotal)} • Cost ${formatCurrency(costTotal)}`
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

function varianceClass(variance: number): string {
  if (variance > 0.005) return 'text-amber-700 dark:text-amber-300'
  if (variance < -0.005) return 'text-emerald-700 dark:text-emerald-300'
  return ''
}

function formatVariance(variance: number): string {
  return `${variance >= 0 ? '+' : ''}${formatCurrency(variance)}`
}

function LaborCompareRow({
  label,
  estimated,
  actual,
  actualDisplay,
  note,
  indent,
  onActualClick,
}: {
  label: string
  estimated: number | null
  actual: number | null
  actualDisplay?: string
  note?: string
  indent?: boolean
  onActualClick?: () => void
}) {
  const est = estimated ?? 0
  const act = actual ?? 0
  const hasBoth = estimated != null && actual != null
  const variance = hasBoth ? act - est : null
  const actualText = actualDisplay ?? (actual == null ? '—' : formatCurrency(actual))
  const actualClickable = onActualClick != null && actual != null && actual > 0

  return (
    <li
      className={cn(
        'grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 tabular-nums',
        indent && 'pl-3 text-muted-foreground',
      )}
    >
      <span className={cn('min-w-0', !indent && 'text-foreground')}>
        {label}
        {note ? (
          <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{note}</span>
        ) : null}
      </span>
      <span className="text-right">
        {estimated == null ? '—' : formatCurrency(estimated)}
      </span>
      <span className="text-right">
        {actualClickable ? (
          <button
            type="button"
            onClick={onActualClick}
            className="cursor-pointer underline-offset-2 hover:underline"
          >
            {actualText}
          </button>
        ) : (
          actualText
        )}
      </span>
      <span className={cn('text-right', variance != null && varianceClass(variance))}>
        {variance == null ? '—' : formatVariance(variance)}
      </span>
    </li>
  )
}

function entriesForCategory(
  entries: DrywallProjectLaborEntryFlat[],
  category: DrywallProjectLaborEntryFlat['category'],
): DrywallProjectLaborEntryFlat[] {
  return entries.filter((e) => e.category === category)
}

function entriesForComponentKey(
  entries: DrywallProjectLaborEntryFlat[],
  componentKey: string,
): DrywallProjectLaborEntryFlat[] {
  return entries.filter((e) => {
    if (e.category !== 'components') return false
    const rawKey = resolvePieceEntryKey({ piece_key: e.pieceKey, workType: e.workType })
    return componentEstimateKeyFromPieceKey(rawKey) === componentKey
  })
}

function entriesForUnmapped(entries: DrywallProjectLaborEntryFlat[]): DrywallProjectLaborEntryFlat[] {
  return entries.filter((e) => e.category === 'legacy' || e.category === 'hourly' || e.category === 'other')
}

type DrillFilter =
  | { kind: 'category'; category: DrywallLaborCategory }
  | { kind: 'component'; pieceKey: string }
  | { kind: 'unmapped' }

function entriesForDrill(
  entries: DrywallProjectLaborEntryFlat[],
  filter: DrillFilter,
): DrywallProjectLaborEntryFlat[] {
  switch (filter.kind) {
    case 'category':
      return entriesForCategory(entries, filter.category)
    case 'component':
      return entriesForComponentKey(entries, filter.pieceKey)
    case 'unmapped':
      return entriesForUnmapped(entries)
  }
}

export function EstimatedVsActualLaborTile({
  icon: Icon,
  estimated,
  actual,
  onDataChanged,
}: {
  icon: LucideIcon
  estimated: EstimatedLaborBreakdown
  actual: DrywallProjectLaborSummary
  onDataChanged?: () => void
}) {
  const [drill, setDrill] = useState<{
    title: string
    filter: DrillFilter
  } | null>(null)

  const openDrill = (title: string, filter: DrillFilter) => {
    setDrill({ title, filter })
  }

  const drillEntries = drill ? entriesForDrill(actual.entries, drill.filter) : []

  const estimatedTotal = estimated.total
  const actualTotal = actual.totalCost
  const variance = actualTotal - estimatedTotal
  const variancePct = estimatedTotal > 0 ? (variance / estimatedTotal) * 100 : null
  const hasEstimate =
    estimatedTotal > 0 ||
    estimated.hanger > 0 ||
    estimated.finisher > 0 ||
    estimated.prepClean > 0 ||
    estimated.components.length > 0
  const isOver = variance > 0.005
  const isUnder = variance < -0.005

  const actualByComponent = new Map<string, number>()
  for (const entry of actual.entries) {
    if (entry.category !== 'components') continue
    const rawKey = resolvePieceEntryKey({ piece_key: entry.pieceKey, workType: entry.workType })
    if (!rawKey) continue
    const key = componentEstimateKeyFromPieceKey(rawKey)
    actualByComponent.set(key, (actualByComponent.get(key) ?? 0) + entry.amount)
  }

  const componentKeys = new Set<string>([
    ...estimated.components.map((c) => c.key),
    ...actualByComponent.keys(),
  ])
  const componentRows = Array.from(componentKeys)
    .map((key) => ({
      key,
      label: componentLaborLabel(key),
      estimated: estimated.components.find((c) => c.key === key)?.amount ?? 0,
      actual: actualByComponent.get(key) ?? 0,
    }))
    .filter((row) => row.estimated > 0 || row.actual > 0)
    .sort((a, b) => Math.max(b.estimated, b.actual) - Math.max(a.estimated, a.actual))

  const unmappedRows: Array<{ key: string; label: string; amount: number }> = [
    { key: 'legacy', label: 'Legacy', amount: actual.byCategory.legacy ?? 0 },
    { key: 'hourly', label: 'Hourly', amount: actual.byCategory.hourly ?? 0 },
    { key: 'other', label: 'Other', amount: actual.byCategory.other ?? 0 },
  ].filter((row) => row.amount > 0)

  const unmappedTotal = unmappedRows.reduce((sum, row) => sum + row.amount, 0)

  return (
    <>
      <LaborBreakdownModal
        open={drill != null}
        onOpenChange={(open) => {
          if (!open) setDrill(null)
        }}
        title={drill?.title ?? ''}
        entries={drillEntries}
        onDataChanged={onDataChanged}
      />
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
          <Icon className="h-4 w-4 text-muted-foreground" />
          Estimated vs Actual Labor
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
        <p className="text-xs text-muted-foreground">Incl. labor burden (25% on W2 actuals).</p>

        {hasEstimate ? (
          <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border bg-muted/20 px-4 py-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Estimated base labor
              </p>
              <p className="text-lg font-semibold tabular-nums">{formatCurrency(estimatedTotal)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Actual</p>
              <p className="text-lg font-semibold tabular-nums">{formatCurrency(actualTotal)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Variance</p>
              <p className={cn('text-lg font-semibold tabular-nums', varianceClass(variance))}>
                {formatVariance(variance)}
                {variancePct != null
                  ? ` (${variancePct >= 0 ? '+' : ''}${variancePct.toFixed(1)}%)`
                  : ''}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No quote labor estimate — complete the quote to compare against payroll labor.
          </p>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            By trade
          </p>
          <div className="rounded-lg border px-3 py-2 text-sm">
            <div className="mb-2 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span>Line</span>
              <span className="text-right">Est.</span>
              <span className="text-right">Actual</span>
              <span className="text-right">Var.</span>
            </div>
            <ul className="space-y-1.5">
              <LaborCompareRow
                label="Hanger"
                estimated={estimated.hanger}
                actual={actual.byCategory.hanger ?? 0}
                onActualClick={() => openDrill('Hanger — actual', { kind: 'category', category: 'hanger' })}
              />
              <LaborCompareRow
                label="Finisher"
                estimated={estimated.finisher}
                actual={actual.byCategory.finisher ?? 0}
                onActualClick={() =>
                  openDrill('Finisher — actual', { kind: 'category', category: 'finisher' })
                }
              />
              <LaborCompareRow
                label="Prep / Clean"
                estimated={estimated.prepClean}
                actual={actual.byCategory.prepClean ?? 0}
                onActualClick={() =>
                  openDrill('Prep / Clean — actual', { kind: 'category', category: 'prepClean' })
                }
              />
              {(estimated.componentsTotal > 0 || componentRows.length > 0) && (
                <>
                  <LaborCompareRow
                    label="Components"
                    estimated={estimated.componentsTotal}
                    actual={actual.byCategory.components ?? 0}
                    onActualClick={() =>
                      openDrill('Components — actual', { kind: 'category', category: 'components' })
                    }
                  />
                  {componentRows.map((row) => (
                    <LaborCompareRow
                      key={row.key}
                      label={row.label}
                      estimated={row.estimated}
                      actual={row.actual}
                      indent
                      onActualClick={() =>
                        openDrill(`Components · ${row.label}`, {
                          kind: 'component',
                          pieceKey: row.key,
                        })
                      }
                    />
                  ))}
                </>
              )}
            </ul>
            <div className="mt-2 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-t pt-2 font-medium tabular-nums">
              <span>Mapped total</span>
              <span className="text-right">
                {formatCurrency(
                  estimated.hanger +
                    estimated.finisher +
                    estimated.prepClean +
                    estimated.componentsTotal,
                )}
              </span>
              <span className="text-right">
                {formatCurrency(
                  (actual.byCategory.hanger ?? 0) +
                    (actual.byCategory.finisher ?? 0) +
                    (actual.byCategory.prepClean ?? 0) +
                    (actual.byCategory.components ?? 0),
                )}
              </span>
              <span className="text-right">—</span>
            </div>
          </div>
        </div>

        {unmappedRows.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Unmapped actual (no estimate line)
            </p>
            <div className="rounded-lg border px-3 py-2 text-sm">
              <ul className="space-y-1.5">
                {unmappedRows.map((row) => (
                  <li key={row.key} className="flex justify-between gap-3 tabular-nums">
                    <span className="text-muted-foreground">{row.label}</span>
                    {row.amount > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          openDrill(`${row.label} — actual`, {
                            kind: 'category',
                            category: row.key as DrywallLaborCategory,
                          })
                        }
                        className="cursor-pointer underline-offset-2 hover:underline"
                      >
                        {formatCurrency(row.amount)}
                      </button>
                    ) : (
                      <span>{formatCurrency(row.amount)}</span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex justify-between gap-3 border-t pt-2 font-medium tabular-nums">
                <span>Unmapped total</span>
                {unmappedTotal > 0 ? (
                  <button
                    type="button"
                    onClick={() => openDrill('Unmapped labor', { kind: 'unmapped' })}
                    className="cursor-pointer underline-offset-2 hover:underline"
                  >
                    {formatCurrency(unmappedTotal)}
                  </button>
                ) : (
                  <span>{formatCurrency(unmappedTotal)}</span>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex justify-between gap-3 border-t pt-3 text-sm font-medium tabular-nums">
          <span>Total (actual)</span>
          <span>{formatCurrency(actualTotal)}</span>
        </div>
      </CardContent>
    </Card>
    </>
  )
}

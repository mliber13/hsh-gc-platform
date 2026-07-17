import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createEmptyBreakdown } from '@/lib/drywall/createEmptyDrywallQuote'
import type {
  DrywallQuote,
  MetalStudEntry,
  QuoteBreakdown,
  RcChannelWallEntry,
} from '@/types/drywall'
import { BreakdownOptionalSections } from './BreakdownOptionalSections'

const MATCH_TOLERANCE = 0.01

function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function sumRcWallLf(entries: RcChannelWallEntry[] | undefined): number {
  return (entries ?? []).reduce((sum, entry) => sum + num(entry.linearFt), 0)
}

function sumMetalStudLf(entries: MetalStudEntry[] | undefined): number {
  return (entries ?? []).reduce((sum, entry) => sum + num(entry.wallLf), 0)
}

function breakdownRcWallLf(item: QuoteBreakdown): number {
  return item.rcChannelWallEntries?.length
    ? sumRcWallLf(item.rcChannelWallEntries)
    : num(item.rcChannelWallLinearFt)
}

function breakdownMetalStudLf(item: QuoteBreakdown): number {
  return item.metalStudEntries?.length
    ? sumMetalStudLf(item.metalStudEntries)
    : num(item.metalStudWallLf)
}

interface AuditRow {
  label: string
  unit: 'sqft' | 'LF'
  projectTotal: number
  breakdownTotal: number
}

function formatQuantity(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

interface Props {
  quote: DrywallQuote
  readOnly: boolean
  onChange: (breakdowns: QuoteBreakdown[]) => void
}

export function QuoteBreakdownsSection({ quote, readOnly, onChange }: Props) {
  const breakdowns = quote.breakdowns || []
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(breakdowns.map((b) => b.id)))

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const update = (id: string, patch: Partial<QuoteBreakdown>) => {
    onChange(
      breakdowns.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    )
  }

  const remove = (id: string) => {
    onChange(breakdowns.filter((b) => b.id !== id))
  }

  const add = () => {
    const b = createEmptyBreakdown(`Floor ${breakdowns.length + 1}`)
    setOpenIds((prev) => new Set(prev).add(b.id))
    onChange([...breakdowns, b])
  }

  if (breakdowns.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
          <p className="text-muted-foreground">Start by adding your first breakdown</p>
          {!readOnly && (
            <Button type="button" size="lg" onClick={add}>
              <Plus className="mr-2 h-5 w-5" />
              Add breakdown
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  const totalBaseSqft = breakdowns.reduce((sum, item) => sum + num(item.sqft), 0)
  const wastePct = parseFloat(String(quote.wastePercentage)) || 0
  const auditRows: AuditRow[] = [
    {
      label: 'Drywall',
      unit: 'sqft',
      projectTotal: num(quote.sqft),
      breakdownTotal: totalBaseSqft,
    },
    ...(quote.includeRcChannel
      ? [
          {
            label: 'RC channel — ceiling',
            unit: 'sqft' as const,
            projectTotal: num(quote.rcChannelCeilingSqft),
            breakdownTotal: breakdowns.reduce(
              (sum, item) => sum + num(item.rcChannelCeilingSqft),
              0,
            ),
          },
          {
            label: 'RC channel — walls',
            unit: 'LF' as const,
            projectTotal: sumRcWallLf(quote.rcChannelWallEntries),
            breakdownTotal: breakdowns.reduce(
              (sum, item) => sum + breakdownRcWallLf(item),
              0,
            ),
          },
        ]
      : []),
    ...(quote.includeSuspendedGrid
      ? [
          {
            label: 'Suspended grid',
            unit: 'sqft' as const,
            projectTotal: num(quote.suspendedGridSqft),
            breakdownTotal: breakdowns.reduce(
              (sum, item) => sum + num(item.suspendedGridSqft),
              0,
            ),
          },
        ]
      : []),
    ...(quote.includeMetalStudFraming
      ? [
          {
            label: 'Metal stud framing',
            unit: 'LF' as const,
            projectTotal: sumMetalStudLf(quote.metalStudEntries),
            breakdownTotal: breakdowns.reduce(
              (sum, item) => sum + breakdownMetalStudLf(item),
              0,
            ),
          },
        ]
      : []),
  ]
  const allAuditRowsMatch = auditRows.every(
    (row) => Math.abs(row.breakdownTotal - row.projectTotal) <= MATCH_TOLERANCE,
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Per-floor breakdowns</h3>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={add}>
            <Plus className="mr-1 h-4 w-4" />
            Add floor
          </Button>
        )}
      </div>

      {breakdowns.map((b, index) => {
        const open = openIds.has(b.id)
        return (
          <Card key={b.id}>
            <CardHeader className="flex flex-row items-center gap-2 py-3">
              <button
                type="button"
                className="text-muted-foreground shrink-0"
                onClick={() => toggle(b.id)}
                aria-label={open ? 'Collapse' : 'Expand'}
              >
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <CardTitle className="flex-1 text-base min-w-0">
                <Input
                  disabled={readOnly}
                  value={b.description ?? ''}
                  onChange={(e) => update(b.id, { description: e.target.value })}
                  className="h-8 font-semibold"
                  placeholder="Floor name"
                />
              </CardTitle>
              <div className="flex gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={readOnly || index === 0}
                  title="Move up"
                  onClick={() => {
                    if (index === 0) return
                    const next = [...breakdowns]
                    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
                    onChange(next)
                  }}
                >
                  <span className="text-sm">↑</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={readOnly || index === breakdowns.length - 1}
                  title="Move down"
                  onClick={() => {
                    if (index >= breakdowns.length - 1) return
                    const next = [...breakdowns]
                    ;[next[index + 1], next[index]] = [next[index], next[index + 1]]
                    onChange(next)
                  }}
                >
                  <span className="text-sm">↓</span>
                </Button>
                {!readOnly && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(b.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </CardHeader>
            {open && (
              <CardContent className="pt-0 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Drywall sq ft (base)</Label>
                    <Input
                      type="number"
                      disabled={readOnly}
                      value={b.sqft ?? ''}
                      onChange={(e) => update(b.id, { sqft: e.target.value })}
                    />
                    {wastePct > 0 && parseFloat(String(b.sqft)) > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        + {wastePct}% waste ={' '}
                        {(
                          (parseFloat(String(b.sqft)) || 0) *
                          (1 + wastePct / 100)
                        ).toLocaleString(undefined, { maximumFractionDigits: 0 })}{' '}
                        sqft
                      </p>
                    )}
                  </div>
                </div>

                <BreakdownOptionalSections
                  quote={quote}
                  breakdown={b}
                  readOnly={readOnly}
                  onUpdate={(patch) => update(b.id, patch)}
                />
              </CardContent>
            )}
          </Card>
        )
      })}

      <p className="text-xs text-muted-foreground">
        Total breakdown base sqft: {totalBaseSqft.toLocaleString()}
        {wastePct > 0 && (
          <span>
            {' '}
            (+ {wastePct}% waste ≈ {(totalBaseSqft * (1 + wastePct / 100)).toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}{' '}
            sqft)
          </span>
        )}
      </p>

      <div
        className={`rounded-lg border p-3 ${
          allAuditRowsMatch
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : 'border-amber-500/40 bg-amber-500/5'
        }`}
      >
        <div className="mb-3 flex items-start gap-2">
          {allAuditRowsMatch ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          )}
          <div>
            <p className="text-sm font-semibold">Project vs. breakdown audit</p>
            <p className="text-xs text-muted-foreground">
              {allAuditRowsMatch
                ? 'All trade quantities match the project totals.'
                : 'One or more trade quantities do not match. Review the highlighted differences.'}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="pb-2 text-left font-medium">Trade</th>
                <th className="pb-2 text-right font-medium">Project total</th>
                <th className="pb-2 text-right font-medium">Breakdown total</th>
                <th className="pb-2 text-right font-medium">Difference</th>
                <th className="pb-2 pl-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.map((row) => {
                const difference = row.breakdownTotal - row.projectTotal
                const matches = Math.abs(difference) <= MATCH_TOLERANCE
                return (
                  <tr key={row.label} className="border-b border-border/50 last:border-0">
                    <td className="py-2 font-medium">{row.label}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatQuantity(row.projectTotal)} {row.unit}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatQuantity(row.breakdownTotal)} {row.unit}
                    </td>
                    <td
                      className={`py-2 text-right font-medium tabular-nums ${
                        matches ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {difference > MATCH_TOLERANCE ? '+' : ''}
                      {formatQuantity(difference)} {row.unit}
                    </td>
                    <td className="py-2 pl-3">
                      <span
                        className={
                          matches
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'font-medium text-amber-700 dark:text-amber-300'
                        }
                      >
                        {matches ? 'Matches' : 'Mismatch'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Difference = breakdown total − project total. Quantities are compared before waste.
        </p>
      </div>
    </div>
  )
}

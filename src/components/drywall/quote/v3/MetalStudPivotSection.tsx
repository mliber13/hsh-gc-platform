import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TRADE_SECTION_THEMES } from '@/lib/drywall/quoteV3TradeTheme'
import {
  computeLineItem,
  formatQuoteMoney,
  type QuoteV3LaborBurdenOptions,
} from '@/lib/drywall/quoteV3Math'
import { createQuoteLineItem } from '@/lib/drywall/createEmptyDrywallQuoteV3'
import {
  METAL_STUD_GAUGES,
  METAL_STUD_SIZES,
  METAL_STUD_SPACING_OPTIONS,
  METAL_STUD_TRACKS_OPTIONS,
} from '@/components/drywall/quote/quoteUiConstants'
import { CurrencyAmountCell } from './CurrencyAmountCell'
import type { QuoteLineItem } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

type Props = {
  lines: QuoteLineItem[]
  catalogs: OrgDrywallCatalogs
  readOnly: boolean
  compact?: boolean
  lineComputeOptions: QuoteV3LaborBurdenOptions
  sectionSubtotal: number
  onChange: (lines: QuoteLineItem[]) => void
}

const norm = (s: string) => s.trim().toLowerCase()

export function MetalStudPivotSection({
  lines,
  catalogs,
  readOnly,
  lineComputeOptions,
  sectionSubtotal,
  onChange,
}: Props) {
  const theme = TRADE_SECTION_THEMES.metal_stud
  const TradeIcon = theme.icon

  const rowMoney = (l: QuoteLineItem) =>
    computeLineItem(l, catalogs, { ...lineComputeOptions, allocatedBeadSticks: 0 })

  const allLocations = useMemo(() => {
    const set = new Set<string>()
    for (const l of lines) {
      const t = l.location.trim()
      if (t) set.add(t)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [lines])

  // location → metal_stud lines (insertion order preserved)
  const byLocation = useMemo(() => {
    const locs = new Map<string, { label: string; runs: QuoteLineItem[] }>()
    for (const l of lines) {
      if (l.type !== 'metal_stud') continue
      const lkey = norm(l.location) || '—'
      if (!locs.has(lkey)) locs.set(lkey, { label: l.location.trim() || 'No location', runs: [] })
      locs.get(lkey)!.runs.push(l)
    }
    return locs
  }, [lines])

  const updateLine = (id: string, patch: Partial<QuoteLineItem>) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const removeLine = (id: string) => onChange(lines.filter((l) => l.id !== id))

  const addRun = (location: string) => {
    const line = createQuoteLineItem('metal_stud', { location })
    onChange([...lines, { ...line, quantity: 0 }])
  }

  const anyUnpriced = catalogs.metal_stud.length === 0

  return (
    <div className={cn('rounded-lg border border-l-4', theme.borderClass)}>
      <div className={cn('flex items-center justify-between border-b px-3 py-2', theme.headerClass)}>
        <span className="flex items-center gap-2 text-sm font-semibold">
          <TradeIcon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
          Metal Stud Framing
        </span>
        <div className="text-right">
          <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">
            Section subtotal
          </span>
          <span className="block text-sm font-bold tabular-nums">
            {formatQuoteMoney(sectionSubtotal)}
          </span>
        </div>
      </div>

      {anyUnpriced && (
        <p className="border-b bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          No metal-stud rates in the catalog yet — set stud &amp; track $/LF by size × gauge in
          Drywall settings → Catalogs → Metal stud, or these lines price at $0.
        </p>
      )}

      <datalist id="ms-pivot-locations">
        {allLocations.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>

      <div className="space-y-4 p-3">
        {[...byLocation.values()].map((loc) => {
          const locTotal = loc.runs.reduce((s, l) => s + rowMoney(l).lineTotal, 0)
          const locLineIds = new Set(loc.runs.map((l) => l.id))
          const renameLocation = (next: string) =>
            onChange(lines.map((l) => (locLineIds.has(l.id) ? { ...l, location: next } : l)))
          return (
            <div key={loc.label} className="rounded-lg border bg-muted/10">
              <div className="flex items-center justify-between gap-3 border-b bg-muted/20 px-2.5 py-2 text-xs font-semibold text-muted-foreground">
                <LocationRenameInput value={loc.label} readOnly={readOnly} onCommit={renameLocation} />
                <span className="shrink-0">
                  Subtotal{' '}
                  <span className="tabular-nums text-foreground">{formatQuoteMoney(locTotal)}</span>
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-1.5 text-left font-medium">Size</th>
                      <th className="px-2 py-1.5 text-left font-medium">Gauge</th>
                      <th className="px-2 py-1.5 text-left font-medium">Spacing</th>
                      <th className="px-2 py-1.5 text-right font-medium">Height</th>
                      <th className="px-2 py-1.5 text-left font-medium">Tracks/run</th>
                      <th className="px-2 py-1.5 text-left font-medium">Defl. tracks</th>
                      <th className="px-2 py-1.5 text-right font-medium">Wall LF</th>
                      <th className="px-2 py-1.5 text-right font-medium">Waste %</th>
                      <th className="px-2 py-1.5 text-right font-medium">Studs</th>
                      <th className="px-2 py-1.5 text-right font-medium">Track LF</th>
                      <th className="px-2 py-1.5 text-right font-medium">Defl. LF</th>
                      <th className="px-2 py-1.5 text-right font-medium">Material $</th>
                      <th className="px-2 py-1.5 text-right font-medium">Labor $</th>
                      <th className="px-2 py-1.5 text-right font-medium">Total</th>
                      <th className="px-1 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {loc.runs.map((l) => {
                      const m = rowMoney(l)
                      const studs = m.metalStudBreakdown?.studCount ?? 0
                      // Track LF = all tracks/run (standard + deflection); Defl. LF is the
                      // deflection portion within that total (priced at the deflection rate).
                      const trackLf = Math.round(
                        (m.metalStudBreakdown?.trackLf ?? 0) +
                          (m.metalStudBreakdown?.deflectionTrackLf ?? 0),
                      )
                      const deflectionLf = Math.round(m.metalStudBreakdown?.deflectionTrackLf ?? 0)
                      return (
                        <tr key={l.id} className="border-t">
                          <td className="px-2 py-1.5">
                            <select
                              className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
                              disabled={readOnly}
                              value={l.ms_size ?? '3.625'}
                              onChange={(e) => updateLine(l.id, { ms_size: e.target.value })}
                            >
                              {METAL_STUD_SIZES.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
                              disabled={readOnly}
                              value={l.ms_gauge ?? '20'}
                              onChange={(e) => updateLine(l.id, { ms_gauge: e.target.value })}
                            >
                              {METAL_STUD_GAUGES.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <select
                              className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
                              disabled={readOnly}
                              value={String(l.ms_spacing_in ?? 16)}
                              onChange={(e) =>
                                updateLine(l.id, { ms_spacing_in: parseFloat(e.target.value) || 16 })
                              }
                            >
                              {METAL_STUD_SPACING_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <span className="inline-flex items-center gap-1">
                              <Input
                                type="number"
                                min={0}
                                step={0.1}
                                disabled={readOnly}
                                className="h-7 w-[76px] text-right text-xs tabular-nums"
                                value={l.ms_wall_height ?? ''}
                                placeholder="0"
                                onChange={(e) =>
                                  updateLine(l.id, {
                                    ms_wall_height: e.target.value === '' ? undefined : parseFloat(e.target.value) || 0,
                                  })
                                }
                              />
                              <span className="text-[10px] text-muted-foreground">ft</span>
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <select
                              className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
                              disabled={readOnly}
                              value={String(l.ms_tracks_per_run ?? 2)}
                              onChange={(e) =>
                                updateLine(l.id, { ms_tracks_per_run: parseFloat(e.target.value) || 2 })
                              }
                            >
                              {METAL_STUD_TRACKS_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <select
                              className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
                              disabled={readOnly}
                              value={String(l.ms_deflection_tracks_per_run ?? 0)}
                              onChange={(e) =>
                                updateLine(l.id, {
                                  ms_deflection_tracks_per_run: parseInt(e.target.value, 10) || 0,
                                })
                              }
                            >
                              {Array.from(
                                { length: (l.ms_tracks_per_run ?? 2) + 1 },
                                (_, i) => i,
                              ).map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <Input
                              type="number"
                              min={0}
                              step={0.1}
                              disabled={readOnly}
                              className="h-7 w-[100px] text-right text-xs tabular-nums"
                              value={l.quantity || ''}
                              placeholder="0"
                              onChange={(e) =>
                                updateLine(l.id, { quantity: parseFloat(e.target.value) || 0 })
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <Input
                              type="number"
                              min={0}
                              step={0.5}
                              disabled={readOnly}
                              className="h-7 w-[64px] text-right text-xs tabular-nums"
                              value={l.waste_pct ?? 10}
                              onChange={(e) =>
                                updateLine(l.id, { waste_pct: parseFloat(e.target.value) || 0 })
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                            {studs}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                            {trackLf.toLocaleString()}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                            {deflectionLf.toLocaleString()}
                          </td>
                          <CurrencyAmountCell
                            value={m.materialTotal}
                            variant="material"
                            showWasteHint
                            className="px-2 py-1.5"
                          />
                          <CurrencyAmountCell
                            value={m.laborTotal}
                            variant="labor"
                            showWasteHint
                            className="px-2 py-1.5"
                          />
                          <CurrencyAmountCell value={m.lineTotal} variant="total" className="px-2 py-1.5" />
                          <td className="px-1 py-1.5 text-right">
                            {!readOnly && (
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => removeLine(l.id)}
                                aria-label="Remove run"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {!readOnly && (
                <div className="border-t bg-muted/10 px-2.5 py-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => addRun(loc.label)}
                  >
                    <Plus className="h-3 w-3 text-primary" /> Add run
                  </Button>
                </div>
              )}
            </div>
          )
        })}

        {!readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => addRun('')}
          >
            <Plus className="h-3 w-3 text-primary" /> Add metal stud run
          </Button>
        )}
      </div>
    </div>
  )
}

/** Editable location header — draft state so re-grouping (keyed on location) doesn't steal focus. */
function LocationRenameInput({
  value,
  readOnly,
  onCommit,
}: {
  value: string
  readOnly: boolean
  onCommit: (v: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  if (readOnly) return <span className="text-sm">{value}</span>
  const commit = () => {
    const t = draft.trim()
    if (t && t !== value) onCommit(t)
    else setDraft(value)
  }
  return (
    <input
      list="ms-pivot-locations"
      value={draft}
      title="Rename location (matches drywall locations)"
      aria-label="Location"
      className="h-7 min-w-0 max-w-[240px] flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-sm font-semibold text-foreground hover:border-input focus:border-input focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

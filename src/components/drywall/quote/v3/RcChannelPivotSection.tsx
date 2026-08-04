import { useMemo } from 'react'
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
import { generateQuoteId } from '@/lib/drywall/drywallQuoteHelpers'
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
const num = (v: string): number | undefined => (v === '' ? undefined : parseFloat(v) || 0)

/** Lines sharing one RC spec (type + rates + waste) group together in the pivot. */
function specKey(l: QuoteLineItem): string {
  return [l.catalog_id, l.custom_material_rate ?? '', l.custom_labor_rate ?? '', l.waste_pct ?? ''].join(
    '|',
  )
}
function groupKey(l: QuoteLineItem): string {
  return l.component_group_id ?? `spec:${specKey(l)}`
}

export function RcChannelPivotSection({
  lines,
  catalogs,
  readOnly,
  compact,
  lineComputeOptions,
  sectionSubtotal,
  onChange,
}: Props) {
  const theme = TRADE_SECTION_THEMES.rc_channel
  const TradeIcon = theme.icon

  const rowMoney = (l: QuoteLineItem) =>
    computeLineItem(l, catalogs, { ...lineComputeOptions, allocatedBeadSticks: 0 })

  // location → groupKey → lines (insertion order preserved)
  const byLocation = useMemo(() => {
    const locs = new Map<string, { label: string; groups: Map<string, QuoteLineItem[]> }>()
    for (const l of lines) {
      if (l.type !== 'rc_channel') continue
      const lkey = norm(l.location) || '—'
      if (!locs.has(lkey)) locs.set(lkey, { label: l.location.trim() || 'No location', groups: new Map() })
      const groups = locs.get(lkey)!.groups
      const gkey = groupKey(l)
      if (!groups.has(gkey)) groups.set(gkey, [])
      groups.get(gkey)!.push(l)
    }
    return locs
  }, [lines])

  const updateLine = (id: string, patch: Partial<QuoteLineItem>) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  const updateGroup = (ids: Set<string>, patch: Partial<QuoteLineItem>) =>
    onChange(lines.map((l) => (ids.has(l.id) ? { ...l, ...patch } : l)))

  const removeLine = (id: string) => onChange(lines.filter((l) => l.id !== id))

  const addRow = (spec: QuoteLineItem, location: string, surface: 'wall' | 'ceiling') => {
    const line = createQuoteLineItem('rc_channel', { location })
    onChange([
      ...lines,
      {
        ...line,
        catalog_id: spec.catalog_id,
        custom_material_rate: spec.custom_material_rate,
        custom_labor_rate: spec.custom_labor_rate,
        waste_pct: spec.waste_pct,
        component_group_id: spec.component_group_id,
        rc_surface: surface,
        rc_spacing_in: surface === 'ceiling' ? 16 : 24,
        rc_wall_height: surface === 'wall' ? 10 : undefined,
        quantity: 0,
      },
    ])
  }

  const addGroup = (location: string) => {
    const line = createQuoteLineItem('rc_channel', { location })
    onChange([
      ...lines,
      {
        ...line,
        component_group_id: generateQuoteId(),
        rc_surface: 'ceiling',
        rc_spacing_in: 16,
        quantity: 0,
      },
    ])
  }

  const chip = (l: QuoteLineItem) =>
    l.rc_surface === 'ceiling' ? 'Ceiling' : 'Wall'

  return (
    <div className={cn('rounded-lg border border-l-4', theme.borderClass)}>
      <div className={cn('flex items-center justify-between border-b px-3 py-2', theme.headerClass)}>
        <span className="flex items-center gap-2 text-sm font-semibold">
          <TradeIcon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
          RC Channel
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

      <div className="space-y-4 p-3">
        {[...byLocation.values()].map((loc) => {
          const locTotal = [...loc.groups.values()]
            .flat()
            .reduce((s, l) => s + rowMoney(l).lineTotal, 0)
          return (
            <div key={loc.label}>
              <div className="mb-2 flex items-baseline justify-between text-xs font-semibold text-muted-foreground">
                <span>{loc.label}</span>
                <span>
                  Subtotal{' '}
                  <span className="tabular-nums text-foreground">{formatQuoteMoney(locTotal)}</span>
                </span>
              </div>

              {[...loc.groups.entries()].map(([gkey, groupLines]) => {
                const spec = groupLines[0]
                const ids = new Set(groupLines.map((l) => l.id))
                const groupTotal = groupLines.reduce((s, l) => s + rowMoney(l).lineTotal, 0)
                return (
                  <div key={gkey} className="mb-3 rounded-lg border bg-muted/10">
                    {/* Spec header — set once for the whole group */}
                    <div className="flex flex-wrap items-end gap-3 border-b bg-muted/20 p-2.5">
                      <SpecField label="RC type">
                        <select
                          className="h-8 min-w-[120px] rounded-md border border-input bg-background px-2 text-xs"
                          disabled={readOnly}
                          value={spec.catalog_id}
                          onChange={(e) => updateGroup(ids, { catalog_id: e.target.value })}
                        >
                          <option value="">Select…</option>
                          {catalogs.rc_channel.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.display_name}
                            </option>
                          ))}
                        </select>
                      </SpecField>
                      <SpecField label="Material $/piece">
                        <RateInput
                          value={spec.custom_material_rate}
                          readOnly={readOnly}
                          onChange={(v) => updateGroup(ids, { custom_material_rate: v })}
                        />
                      </SpecField>
                      <SpecField label="Labor $/LF">
                        <RateInput
                          value={spec.custom_labor_rate}
                          readOnly={readOnly}
                          onChange={(v) => updateGroup(ids, { custom_labor_rate: v })}
                        />
                      </SpecField>
                      <SpecField label="Waste %">
                        <Input
                          type="number"
                          min={0}
                          step={0.1}
                          disabled={readOnly}
                          className="h-8 w-[60px] text-right text-xs tabular-nums"
                          value={spec.waste_pct ?? 10}
                          onChange={(e) => updateGroup(ids, { waste_pct: parseFloat(e.target.value) || 0 })}
                        />
                      </SpecField>
                    </div>

                    {/* Variation grid */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            <th className="px-2 py-1.5 text-left font-medium">Surface</th>
                            <th className="px-2 py-1.5 text-right font-medium">Height</th>
                            <th className="px-2 py-1.5 text-right font-medium">Spacing</th>
                            <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                            <th className="px-2 py-1.5 text-right font-medium">Material $</th>
                            <th className="px-2 py-1.5 text-right font-medium">Labor $</th>
                            <th className="px-2 py-1.5 text-right font-medium">Acc. $</th>
                            <th className="px-2 py-1.5 text-right font-medium">Total</th>
                            <th className="px-1 py-1.5" />
                          </tr>
                        </thead>
                        <tbody>
                          {groupLines.map((l) => {
                            const m = rowMoney(l)
                            const isWall = l.rc_surface !== 'ceiling'
                            return (
                              <tr key={l.id} className="border-t">
                                <td className="px-2 py-1.5">
                                  <select
                                    className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
                                    disabled={readOnly}
                                    value={isWall ? 'wall' : 'ceiling'}
                                    onChange={(e) =>
                                      updateLine(l.id, {
                                        rc_surface: e.target.value === 'ceiling' ? 'ceiling' : 'wall',
                                      })
                                    }
                                  >
                                    <option value="wall">Wall</option>
                                    <option value="ceiling">Ceiling</option>
                                  </select>
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  {isWall ? (
                                    <span className="inline-flex items-center gap-1">
                                      <Input
                                        type="number"
                                        min={0}
                                        step={0.1}
                                        disabled={readOnly}
                                        className="h-7 w-[54px] text-right text-xs tabular-nums"
                                        value={l.rc_wall_height ?? ''}
                                        onChange={(e) =>
                                          updateLine(l.id, { rc_wall_height: num(e.target.value) })
                                        }
                                      />
                                      <span className="text-[10px] text-muted-foreground">ft</span>
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/50">—</span>
                                  )}
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  <span className="inline-flex items-center gap-1">
                                    <Input
                                      type="number"
                                      min={1}
                                      step={1}
                                      disabled={readOnly}
                                      className="h-7 w-[54px] text-right text-xs tabular-nums"
                                      value={l.rc_spacing_in ?? 24}
                                      onChange={(e) =>
                                        updateLine(l.id, { rc_spacing_in: parseFloat(e.target.value) || 24 })
                                      }
                                    />
                                    <span className="text-[10px] text-muted-foreground">in</span>
                                  </span>
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  <span className="inline-flex items-center gap-1">
                                    <Input
                                      type="number"
                                      min={0}
                                      step={0.1}
                                      disabled={readOnly}
                                      className="h-7 w-[92px] text-right text-xs tabular-nums"
                                      value={l.quantity || ''}
                                      placeholder="0"
                                      onChange={(e) =>
                                        updateLine(l.id, { quantity: parseFloat(e.target.value) || 0 })
                                      }
                                    />
                                    <span className="w-[26px] text-left text-[11px] font-medium text-muted-foreground">
                                      {isWall ? 'LF' : 'sqft'}
                                    </span>
                                  </span>
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
                                <CurrencyAmountCell
                                  value={m.accessoriesTotal}
                                  variant="accessories"
                                  showWasteHint
                                  className="px-2 py-1.5"
                                />
                                <CurrencyAmountCell
                                  value={m.lineTotal}
                                  variant="total"
                                  className="px-2 py-1.5"
                                />
                                <td className="px-1 py-1.5 text-right">
                                  {!readOnly && (
                                    <button
                                      type="button"
                                      className="text-muted-foreground hover:text-destructive"
                                      onClick={() => removeLine(l.id)}
                                      aria-label="Remove row"
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
                      <div className="flex items-center justify-between gap-2 border-t bg-muted/10 px-2.5 py-2">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => addRow(spec, loc.label, 'ceiling')}
                          >
                            <Plus className="h-3 w-3 text-primary" /> Ceiling
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => addRow(spec, loc.label, 'wall')}
                          >
                            <Plus className="h-3 w-3 text-primary" /> Wall height
                          </Button>
                        </div>
                        <span className="text-xs">
                          <span className="mr-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                            Group
                          </span>
                          <span className="font-bold tabular-nums">{formatQuoteMoney(groupTotal)}</span>
                        </span>
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
                  onClick={() => addGroup(loc.label)}
                >
                  <Plus className="h-3 w-3 text-primary" /> Add RC group (different type / rates)
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SpecField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

function RateInput({
  value,
  readOnly,
  onChange,
}: {
  value?: number
  readOnly: boolean
  onChange: (v: number | undefined) => void
}) {
  return (
    <Input
      type="number"
      min={0}
      step={0.01}
      disabled={readOnly}
      className="h-8 w-[80px] text-right text-xs tabular-nums"
      value={value ?? ''}
      placeholder="0.00"
      onChange={(e) => onChange(e.target.value === '' ? undefined : parseFloat(e.target.value) || 0)}
    />
  )
}

import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { TRADE_SECTION_THEMES } from '@/lib/drywall/quoteV3TradeTheme'
import {
  computeLineItem,
  formatQuoteMoney,
  type QuoteV3LaborBurdenOptions,
} from '@/lib/drywall/quoteV3Math'
import { getEffectiveComponentLaborRate } from '@/lib/drywall/quoteV3CatalogResolve'
import { calcAcousticCeilingGridCounts } from '@/lib/drywall/calculations/acousticCeilingGridCalc'
import { createQuoteLineItem } from '@/lib/drywall/createEmptyDrywallQuoteV3'
import { LocationInput } from './LocationInput'
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

type BreakdownRow = { key: string; label: string; qty: number; unit: string; rate: number; total: number }

/** Component counts + $ generated from a ceiling's sqft + perimeter + tile size. */
function acousticRows(line: QuoteLineItem, catalogs: OrgDrywallCatalogs): BreakdownRow[] {
  const sqft = line.quantity || 0
  const waste = line.waste_pct ?? 0
  const sqftW = sqft * (1 + waste / 100)
  const tileSize = line.acst_tile_size === '2x2' ? '2x2' : '2x4'
  const counts = calcAcousticCeilingGridCounts({
    baseSqft: sqft,
    perimeter: line.grid_perimeter,
    wastePct: waste,
    tileSize,
  })
  const ov = line.grid_count_overrides ?? {}
  const find = (ct: string) => catalogs.acoustic.find((e) => e.component_type === ct)
  const rate = (ct: string) => find(ct)?.material_rate ?? 0

  const tileEntry = find('tile')
  const tileBySqft = tileEntry?.unit === 'sqft'
  const tileQty = tileBySqft
    ? Math.round(sqftW)
    : (ov.tiles ?? Math.ceil(sqftW / (tileSize === '2x2' ? 4 : 8)))
  const tileRate = tileEntry?.material_rate ?? 0

  const rows: BreakdownRow[] = [
    {
      key: 'tile',
      label: 'Ceiling Tile',
      qty: tileQty,
      unit: tileBySqft ? 'sqft' : 'pcs',
      rate: tileRate,
      total: tileQty * tileRate,
    },
    { key: 'mains', label: 'Main Runner', qty: ov.mains ?? counts?.mainsCount ?? 0, unit: 'pcs', rate: rate('mains'), total: 0 },
    { key: 'tees_4ft', label: 'Cross Tee — 4 ft', qty: ov.tees_4ft ?? counts?.tees4ftCount ?? 0, unit: 'pcs', rate: rate('tees_4ft'), total: 0 },
    ...(tileSize === '2x2'
      ? [{ key: 'tees_2ft', label: 'Cross Tee — 2 ft', qty: ov.tees_2ft ?? counts?.tees2ftCount ?? 0, unit: 'pcs', rate: rate('tees_2ft'), total: 0 }]
      : []),
    { key: 'wall_angle', label: 'Wall Angle', qty: ov.wall_angle ?? counts?.wallAngleCount ?? 0, unit: 'pcs', rate: rate('wall_angle'), total: 0 },
    { key: 'wire', label: 'Hanger Wire', qty: ov.wire ?? Math.round(Number(counts?.wireLinearFt ?? 0)), unit: 'LF', rate: rate('wire'), total: 0 },
    { key: 'lags', label: 'Lags', qty: ov.lags ?? counts?.lagsCount ?? 0, unit: 'pcs', rate: rate('lags'), total: 0 },
  ]
  return rows.map((r) => (r.key === 'tile' ? r : { ...r, total: r.qty * r.rate }))
}

export function AcousticPivotSection({
  lines,
  catalogs,
  readOnly,
  compact,
  lineComputeOptions,
  sectionSubtotal,
  onChange,
}: Props) {
  const theme = TRADE_SECTION_THEMES.acoustic
  const TradeIcon = theme.icon
  const ceilings = lines.filter((l) => l.type === 'acoustic')

  const updateLine = (id: string, patch: Partial<QuoteLineItem>) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const removeLine = (id: string) => onChange(lines.filter((l) => l.id !== id))
  const addCeiling = () => onChange([...lines, createQuoteLineItem('acoustic', { location: '' })])

  const num = (v: string): number | undefined => (v === '' ? undefined : parseFloat(v) || 0)

  return (
    <div className={cn('rounded-lg border border-l-4', theme.borderClass)}>
      <div className={cn('flex items-center justify-between border-b px-3 py-2', theme.headerClass)}>
        <span className="flex items-center gap-2 text-sm font-semibold">
          <TradeIcon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
          Acoustic Ceiling
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

      <div className="space-y-3 p-3">
        {ceilings.length === 0 && (
          <p className="text-xs text-muted-foreground">No acoustic ceilings yet.</p>
        )}
        {ceilings.map((line) => {
          const computed = computeLineItem(line, catalogs, {
            ...lineComputeOptions,
            allocatedBeadSticks: 0,
          })
          const rows = acousticRows(line, catalogs)
          const laborRate = getEffectiveComponentLaborRate(line, catalogs)
          const sqftW = (line.quantity || 0) * (1 + (line.waste_pct ?? 0) / 100)
          return (
            <div key={line.id} className="rounded-lg border bg-muted/10">
              {/* Ceiling inputs */}
              <div className="flex flex-wrap items-end gap-3 border-b bg-muted/20 p-2.5">
                <div className="min-w-[10rem] flex-1">
                  <LabelSm>Location</LabelSm>
                  <LocationInput
                    value={line.location}
                    readOnly={readOnly}
                    onChange={(v) => updateLine(line.id, { location: v })}
                  />
                </div>
                <Field label="Ceiling sqft">
                  <NumInput
                    value={line.quantity || ''}
                    readOnly={readOnly}
                    className="w-[92px]"
                    onChange={(e) => updateLine(line.id, { quantity: parseFloat(e.target.value) || 0 })}
                  />
                </Field>
                <Field label="Perimeter (LF)">
                  <NumInput
                    value={line.grid_perimeter ?? ''}
                    readOnly={readOnly}
                    className="w-[92px]"
                    placeholder={`≈${Math.round(4 * Math.sqrt(line.quantity || 0))}`}
                    title="Drives the wall-angle (wall molding) count; blank = 4×√sqft"
                    onChange={(e) => updateLine(line.id, { grid_perimeter: num(e.target.value) })}
                  />
                </Field>
                <Field label="Tile size">
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    disabled={readOnly}
                    value={line.acst_tile_size === '2x2' ? '2x2' : '2x4'}
                    onChange={(e) =>
                      updateLine(line.id, { acst_tile_size: e.target.value === '2x2' ? '2x2' : '2x4' })
                    }
                  >
                    <option value="2x4">2×4</option>
                    <option value="2x2">2×2</option>
                  </select>
                </Field>
                <Field label="Waste %">
                  <NumInput
                    value={line.waste_pct ?? 0}
                    readOnly={readOnly}
                    className="w-[64px]"
                    onChange={(e) => updateLine(line.id, { waste_pct: parseFloat(e.target.value) || 0 })}
                  />
                </Field>
                <Field label="Labor $/sqft">
                  <NumInput
                    value={line.custom_labor_rate ?? ''}
                    readOnly={readOnly}
                    className="w-[80px]"
                    placeholder="2.00"
                    step={0.01}
                    onChange={(e) => updateLine(line.id, { custom_labor_rate: num(e.target.value) })}
                  />
                </Field>
                {!readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => removeLine(line.id)}
                    aria-label="Remove ceiling"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Generated component breakdown */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-2.5 py-1.5 text-left font-medium">Component</th>
                      <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                      <th className="px-2 py-1.5 text-right font-medium">Rate</th>
                      <th className="px-2.5 py-1.5 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className="border-t">
                        <td className="px-2.5 py-1.5">{r.label}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {r.qty.toLocaleString()} <span className="text-muted-foreground">{r.unit}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {r.rate ? formatQuoteMoney(r.rate) : '—'}
                        </td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{formatQuoteMoney(r.total)}</td>
                      </tr>
                    ))}
                    <tr className="border-t">
                      <td className="px-2.5 py-1.5 font-medium">Install labor</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {Math.round(sqftW).toLocaleString()} <span className="text-muted-foreground">sqft</span>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {laborRate ? `${formatQuoteMoney(laborRate)}/sqft` : '—'}
                      </td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums">
                        {formatQuoteMoney(computed.laborTotal)}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/20">
                      <td className="px-2.5 py-1.5 font-semibold" colSpan={3}>
                        Ceiling total
                        {line.waste_pct ? ` · incl. ${line.waste_pct}% waste` : ''}
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-bold tabular-nums">
                        {formatQuoteMoney(computed.lineTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )
        })}

        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn('h-7 gap-1 text-xs', compact && 'text-[11px]')}
            onClick={addCeiling}
          >
            <Plus className="h-3 w-3 text-primary" /> Add ceiling
          </Button>
        )}
      </div>
    </div>
  )
}

function LabelSm({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </label>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <LabelSm>{label}</LabelSm>
      {children}
    </div>
  )
}

function NumInput({
  value,
  readOnly,
  onChange,
  className,
  placeholder,
  title,
  step = 0.1,
}: {
  value: string | number
  readOnly: boolean
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  className?: string
  placeholder?: string
  title?: string
  step?: number
}) {
  return (
    <Input
      type="number"
      min={0}
      step={step}
      disabled={readOnly}
      className={cn('h-8 text-right text-xs tabular-nums', className)}
      value={value}
      placeholder={placeholder}
      title={title}
      onChange={onChange}
    />
  )
}

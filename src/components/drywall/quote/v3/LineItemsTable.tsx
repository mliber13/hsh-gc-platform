import { useMemo, useState, Fragment } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  QUOTE_LINE_TYPE_LABELS,
  catalogColumnLabel,
  catalogOptionsForLineType,
  materialRateHeaderForType,
  componentLaborRateHeaderForType,
  componentLaborRateColumnTitle,
} from '@/lib/drywall/quoteV3CatalogResolve'
import { allocateQuoteBeadSticksAcrossLines } from '@/lib/drywall/quoteV3Accessories'
import { computeLineItem, formatQuoteMoney, type QuoteV3LaborBurdenOptions } from '@/lib/drywall/quoteV3Math'
import { TRADE_SECTION_THEMES } from '@/lib/drywall/quoteV3TradeTheme'
import { cn } from '@/lib/utils'
import { createQuoteLineItem } from '@/lib/drywall/createEmptyDrywallQuoteV3'
import type { QuoteLineItem, QuoteLineItemType } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import { LineItemEditDialog } from './LineItemEditDialog'
import {
  ComponentLaborRateCell,
  MaterialRateCell,
} from './LineRateCells'
import {
  LocationInput,
  LOCATION_COLUMN_TOOLTIP,
  lastLocationForLineType,
  normalizeLocationLabel,
} from './LocationInput'
import { QuantityInput } from './QuantityInput'
import { CurrencyAmountCell } from './CurrencyAmountCell'
import {
  laborAmountTooltip,
  lineTotalAmountTooltip,
  materialAmountTooltip,
  showsMaterialWasteHint,
} from '@/lib/drywall/quoteV3LineAmountTooltips'
import { AccessoryBreakdownPopover } from './AccessoryBreakdownPopover'

const LINE_TYPES: QuoteLineItemType[] = [
  'drywall',
  'rc_channel',
  'suspended_grid',
  'insulation',
  'acoustic',
  'metal_stud',
  'frp',
]

type Props = {
  lines: QuoteLineItem[]
  catalogs: OrgDrywallCatalogs
  readOnly: boolean
  compact?: boolean
  projectHangerRate?: number
  projectFinisherRate?: number
  quoteBeadSticks?: string | number | null
  onChange: (lines: QuoteLineItem[]) => void
}

type TypeSection = {
  type: QuoteLineItemType
  label: string
  catalogLabel: string
  isDrywall: boolean
  orderedLines: QuoteLineItem[]
  sectionSubtotal: number
}

export function LineItemsTable({
  lines,
  catalogs,
  readOnly,
  compact,
  projectHangerRate,
  projectFinisherRate,
  quoteBeadSticks,
  onChange,
}: Props) {
  const [editLine, setEditLine] = useState<QuoteLineItem | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  const lineComputeOptions = useMemo(
    (): QuoteV3LaborBurdenOptions => ({
      projectHangerRate: projectHangerRate,
      projectFinisherRate: projectFinisherRate,
    }),
    [projectFinisherRate, projectHangerRate],
  )

  const beadAllocation = useMemo(
    () => allocateQuoteBeadSticksAcrossLines(lines, quoteBeadSticks),
    [lines, quoteBeadSticks],
  )

  const typeSections = useMemo(
    () => groupByTypeThenLocation(lines, catalogs, lineComputeOptions, beadAllocation),
    [lines, catalogs, lineComputeOptions, beadAllocation],
  )

  const patchLine = (id: string, patch: Partial<QuoteLineItem>) => {
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const deleteLine = (id: string) => {
    if (!window.confirm('Delete this line item?')) return
    onChange(lines.filter((l) => l.id !== id))
  }

  const addLine = (type: QuoteLineItemType) => {
    const location = lastLocationForLineType(lines, type)
    onChange([
      ...lines,
      createQuoteLineItem(type, { location }),
    ])
  }

  const openEdit = (line: QuoteLineItem) => {
    setEditLine(line)
    setEditOpen(true)
  }

  const saveEdit = (updated: QuoteLineItem) => {
    onChange(lines.map((l) => (l.id === updated.id ? updated : l)))
  }

  return (
    <div className="space-y-4">
      {typeSections.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center text-sm">
          No line items yet. Add a line below.
        </div>
      ) : (
        typeSections.map((section) => (
          <TypeSectionTable
            key={section.type}
            section={section}
            catalogs={catalogs}
            readOnly={readOnly}
            compact={compact}
            lineComputeOptions={lineComputeOptions}
            beadAllocation={beadAllocation}
            onPatch={patchLine}
            onDelete={deleteLine}
            onEdit={openEdit}
          />
        ))
      )}

      {!readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add line
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {LINE_TYPES.map((type) => (
              <DropdownMenuItem key={type} onClick={() => addLine(type)}>
                Add {QUOTE_LINE_TYPE_LABELS[type]} line
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <LineItemEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        line={editLine}
        readOnly={readOnly}
        onSave={saveEdit}
      />
    </div>
  )
}

function lineComputeOptionsFor(
  line: QuoteLineItem,
  base: QuoteV3LaborBurdenOptions,
  beadAllocation: Map<string, number>,
): QuoteV3LaborBurdenOptions {
  return {
    ...base,
    allocatedBeadSticks: beadAllocation.get(line.id) ?? 0,
  }
}

function TypeSectionTable({
  section,
  catalogs,
  readOnly,
  compact,
  lineComputeOptions,
  beadAllocation,
  onPatch,
  onDelete,
  onEdit,
}: {
  section: TypeSection
  catalogs: OrgDrywallCatalogs
  readOnly: boolean
  compact?: boolean
  lineComputeOptions: QuoteV3LaborBurdenOptions
  beadAllocation: Map<string, number>
  onPatch: (id: string, patch: Partial<QuoteLineItem>) => void
  onDelete: (id: string) => void
  onEdit: (line: QuoteLineItem) => void
}) {
  const { isDrywall, catalogLabel, orderedLines, type } = section
  const colSpan = 12
  const matRateHeader = materialRateHeaderForType(type)
  const laborRateHeader = componentLaborRateHeaderForType(type)
  const theme = TRADE_SECTION_THEMES[type]
  const TradeIcon = theme.icon

  return (
    <div className={cn('overflow-x-auto rounded-lg border border-l-4', theme.borderClass)}>
      <div
        className={cn(
          'flex items-center justify-between border-b px-3 py-2',
          theme.headerClass,
        )}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <TradeIcon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
          {section.label}
        </span>
        <div className="text-right">
          <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">
            Section subtotal
          </span>
          <span className="block text-sm font-bold tabular-nums">
            {formatQuoteMoney(section.sectionSubtotal)}
          </span>
        </div>
      </div>
      <table
        className={`w-full table-fixed text-sm ${compact ? 'text-xs' : ''}`}
        style={{ minWidth: isDrywall ? 1210 : 1170 }}
      >
        <colgroup>
          <col style={{ width: 110 }} />
          <col style={{ width: 148 }} />
          <col style={{ width: 82 }} />
          {isDrywall ? (
            <col style={{ width: 128 }} />
          ) : (
            <col style={{ width: 82 }} />
          )}
          {!isDrywall && <col style={{ width: 190 }} />}
          <col style={{ width: isDrywall ? 180 : 164 }} />
          <col style={{ width: 118 }} />
          {isDrywall && <col style={{ width: 64 }} />}
          <col style={{ width: 96 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 52 }} />
        </colgroup>
        <thead>
          <tr className="border-b bg-muted/30 text-left text-xs">
            <th
              className="px-1.5 py-2 font-medium"
              title={LOCATION_COLUMN_TOOLTIP}
            >
              Location
            </th>
            <th className="px-1.5 py-2 font-medium">{catalogLabel}</th>
            <th className="px-1.5 py-2 font-medium" title={matRateHeader}>
              {matRateHeader}
            </th>
            {isDrywall && (
              <th className="px-1.5 py-2 font-medium">Finish</th>
            )}
            {!isDrywall && (
              <th className="px-1.5 py-2 font-medium" title={laborRateHeader}>
                {laborRateHeader}
              </th>
            )}
            {!isDrywall && <th className="px-1.5 py-2 font-medium">Setup</th>}
            <th className="px-1.5 py-2 font-medium">Description</th>
            <th className="px-1.5 py-2 text-center font-medium">Qty</th>
            {isDrywall && (
              <th className="px-1.5 py-2 font-medium">Waste</th>
            )}
            <th className="px-1.5 py-2 font-medium text-right">Material $</th>
            <th className="px-1.5 py-2 font-medium text-right">Labor $</th>
            <th className="px-1.5 py-2 font-medium text-right">Accessories $</th>
            <th className="px-1.5 py-2 font-medium text-right">Total</th>
            <th className="px-1.5 py-2" />
          </tr>
        </thead>
        <tbody>
          {orderedLines.map((line, index) => {
            const showLocationHeader =
              index === 0 ||
              normalizeLocationLabel(line.location) !==
                normalizeLocationLabel(orderedLines[index - 1]?.location)
            const runSubtotal = showLocationHeader
              ? contiguousLocationRunSubtotal(
                  orderedLines,
                  index,
                  catalogs,
                  lineComputeOptions,
                  beadAllocation,
                )
              : 0
            const headerLabel = normalizeLocationLabel(line.location)

            return (
              <Fragment key={line.id}>
                {showLocationHeader && (
                  <tr className={cn(theme.locationSubtotalClass)}>
                    <td
                      colSpan={colSpan - 2}
                      className="px-1.5 py-1.5 text-xs font-medium text-muted-foreground"
                    >
                      ▸ {headerLabel}
                    </td>
                    <td colSpan={2} className="px-1.5 py-1.5 text-right">
                      <span className="mr-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Subtotal
                      </span>
                      <span className="text-sm font-bold tabular-nums">
                        {formatQuoteMoney(runSubtotal)}
                      </span>
                    </td>
                  </tr>
                )}
                <LineRow
                  line={line}
                  catalogs={catalogs}
                  readOnly={readOnly}
                  compact={compact}
                  isDrywall={isDrywall}
                  catalogLabel={catalogLabel}
                  lineComputeOptions={lineComputeOptions}
                  beadAllocation={beadAllocation}
                  onPatch={onPatch}
                  onDelete={onDelete}
                  onEdit={onEdit}
                />
              </Fragment>
            )
          })}
          {orderedLines.length > 0 && (
            <tr className={cn(theme.subtotalRowClass)}>
              <td colSpan={colSpan - 2} className="px-1.5 py-2 text-xs font-semibold">
                {section.label} section subtotal
              </td>
              <td colSpan={2} className="px-1.5 py-2 text-right">
                <span className="text-base font-bold tabular-nums">
                  {formatQuoteMoney(section.sectionSubtotal)}
                </span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function LineRow({
  line,
  catalogs,
  readOnly,
  compact,
  isDrywall,
  catalogLabel,
  lineComputeOptions,
  beadAllocation,
  onPatch,
  onDelete,
  onEdit,
}: {
  line: QuoteLineItem
  catalogs: OrgDrywallCatalogs
  readOnly: boolean
  compact?: boolean
  isDrywall: boolean
  catalogLabel: string
  lineComputeOptions: QuoteV3LaborBurdenOptions
  beadAllocation: Map<string, number>
  onPatch: (id: string, patch: Partial<QuoteLineItem>) => void
  onDelete: (id: string) => void
  onEdit: (line: QuoteLineItem) => void
}) {
  const computed = computeLineItem(
    line,
    catalogs,
    lineComputeOptionsFor(line, lineComputeOptions, beadAllocation),
  )
  const catalogOptions = catalogOptionsForLineType(line.type, catalogs)
  const unitLabel =
    line.type === 'rc_channel'
      ? line.rc_surface === 'ceiling'
        ? 'Ceiling area (sqft)'
        : 'Wall length (LF)'
      : computed.unit

  const patch = (p: Partial<QuoteLineItem>) => onPatch(line.id, p)
  const rcSurface = line.rc_surface === 'ceiling' ? 'ceiling' : 'wall'

  return (
    <tr className="border-b last:border-0 hover:bg-muted/10">
      <td className="px-1.5 py-1">
        <LocationInput
          value={line.location}
          readOnly={readOnly}
          compact={compact}
          onChange={(location) => patch({ location })}
        />
      </td>
      <td className="px-1.5 py-1">
        {readOnly ? (
          <span className="truncate block" title={computed.catalogLabel}>
            {computed.catalogLabel}
          </span>
        ) : (
          <select
            className={`flex h-7 w-full truncate rounded-md border border-input bg-background px-1.5 text-xs font-medium ${compact ? 'text-[11px]' : ''}`}
            value={line.catalog_id}
            title={computed.catalogLabel || undefined}
            onChange={(e) =>
              patch({
                catalog_id: e.target.value,
                custom_material_rate: undefined,
                custom_labor_rate: undefined,
              })
            }
            aria-label={catalogLabel}
          >
            <option value="">Select…</option>
            {catalogOptions.map((o) => (
              <option key={o.id} value={o.id} title={o.label}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="px-1.5 py-1">
        <MaterialRateCell
          line={line}
          catalogs={catalogs}
          readOnly={readOnly}
          compact={compact}
          onPatch={patch}
        />
      </td>
      {isDrywall && (
        <td className="px-1.5 py-1">
          {readOnly ? (
            <span className="truncate block" title={computed.finishLabel}>
              {computed.finishLabel}
            </span>
          ) : (
            <select
              className={`flex h-7 w-full truncate rounded-md border border-input bg-background px-1.5 text-xs ${compact ? 'text-[11px]' : ''}`}
              value={line.finish_scope_id ?? ''}
              onChange={(e) =>
                patch({
                  finish_scope_id: e.target.value,
                })
              }
            >
              <option value="">Select…</option>
              {catalogs.finish_scopes.map((f) => (
                <option key={f.id} value={f.id} title={f.display_name}>
                  {f.display_name}
                </option>
              ))}
            </select>
          )}
        </td>
      )}
      {!isDrywall && (
        <td className="px-1.5 py-1" title={componentLaborRateColumnTitle(line, catalogs)}>
          <ComponentLaborRateCell
            line={line}
            catalogs={catalogs}
            readOnly={readOnly}
            compact={compact}
            onPatch={patch}
          />
        </td>
      )}
      {!isDrywall && (
        <td className="px-1.5 py-1">
          {line.type === 'rc_channel' ? (
            readOnly ? (
              <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                <span>{rcSurface === 'ceiling' ? 'Ceiling' : 'Wall'}</span>
                <span>·</span>
                <span>sp {line.rc_spacing_in ?? 24}"</span>
                {rcSurface === 'wall' && line.rc_wall_height != null ? (
                  <>
                    <span>·</span>
                    <span>ht {line.rc_wall_height}ft</span>
                  </>
                ) : null}
                <span>·</span>
                <span>w {line.waste_pct ?? 10}%</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1">
                <select
                  className={`h-7 rounded-md border border-input bg-background px-1 text-xs ${compact ? 'text-[11px]' : ''}`}
                  value={rcSurface}
                  onChange={(e) =>
                    patch({ rc_surface: e.target.value === 'ceiling' ? 'ceiling' : 'wall' })
                  }
                >
                  <option value="wall">Wall</option>
                  <option value="ceiling">Ceiling</option>
                </select>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  className={`h-7 w-[52px] px-1 text-xs ${compact ? 'text-[11px]' : ''}`}
                  placeholder="sp"
                  title="Spacing (in.)"
                  value={line.rc_spacing_in ?? 24}
                  onChange={(e) => patch({ rc_spacing_in: parseFloat(e.target.value) || 24 })}
                />
                {rcSurface === 'wall' && (
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    className={`h-7 w-[52px] px-1 text-xs ${compact ? 'text-[11px]' : ''}`}
                    placeholder="ht"
                    title="Wall height (ft)"
                    value={line.rc_wall_height ?? ''}
                    onChange={(e) =>
                      patch({
                        rc_wall_height:
                          e.target.value === '' ? undefined : parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                )}
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  className={`h-7 w-[48px] px-1 text-right text-xs tabular-nums ${compact ? 'text-[11px]' : ''}`}
                  title="Waste %"
                  value={line.waste_pct ?? 10}
                  onChange={(e) => patch({ waste_pct: parseFloat(e.target.value) || 0 })}
                />
                <span className="text-[10px] text-muted-foreground">%</span>
              </div>
            )
          ) : null}
        </td>
      )}
      <td className="px-1.5 py-1">
        {readOnly ? (
          <span className="truncate block" title={line.description}>
            {line.description || '—'}
          </span>
        ) : (
          <Input
            className={`h-7 text-xs ${compact ? 'text-[11px]' : ''}`}
            value={line.description}
            placeholder="Notes"
            onChange={(e) => patch({ description: e.target.value })}
          />
        )}
      </td>
      <td className="px-1.5 py-1">
        <QuantityInput
          value={line.quantity}
          unit={unitLabel}
          readOnly={readOnly}
          compact={compact}
          onChange={(quantity) => patch({ quantity })}
        />
      </td>
      {isDrywall && (
        <td className="px-1.5 py-1">
          {readOnly ? (
            <span className="tabular-nums text-xs">{line.waste_pct ?? 10}%</span>
          ) : (
            <Input
              type="number"
              min={0}
              step={0.1}
              className={`h-7 w-[52px] px-1 text-right text-xs tabular-nums ${compact ? 'text-[11px]' : ''}`}
              value={line.waste_pct ?? 10}
              onChange={(e) => patch({ waste_pct: parseFloat(e.target.value) || 0 })}
            />
          )}
        </td>
      )}
      <CurrencyAmountCell
        value={computed.materialTotal}
        variant="material"
        tooltip={materialAmountTooltip(line, catalogs, computed)}
        showWasteHint={showsMaterialWasteHint(line)}
      />
      <CurrencyAmountCell
        value={computed.laborTotal}
        variant="labor"
        tooltip={laborAmountTooltip(line, catalogs, computed)}
        showWasteHint={showsMaterialWasteHint(line)}
      />
      <td className="px-1.5 py-1 text-right">
        <AccessoryBreakdownPopover
          total={computed.accessoriesTotal}
          items={computed.accessories.items}
          showWasteHint={showsMaterialWasteHint(line)}
        />
      </td>
      <CurrencyAmountCell
        value={computed.lineTotal}
        variant="total"
        tooltip={lineTotalAmountTooltip(computed)}
      />
      <td className="px-1.5 py-1">
        {!readOnly && (
          <div className="flex">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit(line)}
              aria-label="Notes and override reason"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={() => onDelete(line.id)}
              aria-label="Delete line"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </td>
    </tr>
  )
}

function contiguousLocationRunSubtotal(
  orderedLines: QuoteLineItem[],
  startIndex: number,
  catalogs: OrgDrywallCatalogs,
  lineComputeOptions: QuoteV3LaborBurdenOptions,
  beadAllocation: Map<string, number>,
): number {
  const loc = normalizeLocationLabel(orderedLines[startIndex]?.location)
  let sum = 0
  for (let i = startIndex; i < orderedLines.length; i++) {
    if (normalizeLocationLabel(orderedLines[i].location) !== loc) break
    sum += computeLineItem(
      orderedLines[i],
      catalogs,
      lineComputeOptionsFor(orderedLines[i], lineComputeOptions, beadAllocation),
    ).lineTotal
  }
  return sum
}

function groupByTypeThenLocation(
  lines: QuoteLineItem[],
  catalogs: OrgDrywallCatalogs,
  lineComputeOptions: QuoteV3LaborBurdenOptions,
  beadAllocation: Map<string, number>,
): TypeSection[] {
  const byType = new Map<QuoteLineItemType, QuoteLineItem[]>()
  for (const line of lines) {
    const bucket = byType.get(line.type) ?? []
    bucket.push(line)
    byType.set(line.type, bucket)
  }

  return LINE_TYPES.filter((type) => (byType.get(type)?.length ?? 0) > 0).map((type) => {
    const typeLines = byType.get(type) ?? []
    const sectionSubtotal = typeLines.reduce(
      (s, l) =>
        s +
        computeLineItem(l, catalogs, lineComputeOptionsFor(l, lineComputeOptions, beadAllocation))
          .lineTotal,
      0,
    )
    return {
      type,
      label: QUOTE_LINE_TYPE_LABELS[type],
      catalogLabel: catalogColumnLabel(type),
      isDrywall: type === 'drywall',
      orderedLines: typeLines,
      sectionSubtotal,
    }
  })
}

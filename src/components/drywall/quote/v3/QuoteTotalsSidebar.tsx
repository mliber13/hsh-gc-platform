import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { includeLaborBurden } from '@/lib/drywall/calculations/quantityUtils'
import {
  evaluateMarginVsFloor,
  formatMarginFloorPct,
  marginFloorIndicator,
} from '@/lib/drywall/marginFloor'
import { summarizeAccessoryItems } from '@/lib/drywall/quoteV3Accessories'
import { formatQuoteMoney, formatPctLabel } from '@/lib/drywall/quoteV3Math'
import type { QuoteV3ComponentLaborByTrade, QuoteV3TotalsSummary } from '@/lib/drywall/quoteV3Math'
import type { DrywallQuoteV3 } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Props = {
  quote: DrywallQuoteV3
  totals: QuoteV3TotalsSummary
  catalogs: OrgDrywallCatalogs
  readOnly: boolean
  onChange: (patch: Partial<DrywallQuoteV3>) => void
}

export function QuoteTotalsSidebar({ quote, totals, catalogs, readOnly, onChange }: Props) {
  const { routine, alternates, grandTotalAllAlternates } = totals
  const markupBase = routine.markupBase
  const estimatedCost =
    routine.linesSubtotal + routine.cleanupTotal + routine.salesTaxAmount
  const marginEval = evaluateMarginVsFloor(
    routine.total,
    estimatedCost,
    catalogs.marginFloorTarget,
  )
  const indicator = marginFloorIndicator(marginEval)
  const floorPctLabel = `${(catalogs.marginFloorTarget * 100).toFixed(0)}%`

  return (
    <Card className="lg:sticky lg:top-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Quote totals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Rates
          </p>
          <RateField
            id="prep-clean-rate"
            label="Cleanup labor (per drywall sqft)"
            value={quote.prep_clean_rate}
            readOnly={readOnly}
            step={0.001}
            prefix="$"
            onChange={(prep_clean_rate) => onChange({ prep_clean_rate })}
          />
          <RateField
            id="project-hanger-rate"
            label="Hanger rate (per drywall sqft)"
            value={quote.project_hanger_rate ?? 0}
            readOnly={readOnly}
            step={0.001}
            prefix="$"
            onChange={(project_hanger_rate) => onChange({ project_hanger_rate })}
          />
          <RateField
            id="project-finisher-rate"
            label="Finisher rate (per drywall sqft)"
            value={quote.project_finisher_rate ?? 0}
            readOnly={readOnly}
            step={0.001}
            prefix="$"
            onChange={(project_finisher_rate) => onChange({ project_finisher_rate })}
          />
          <p className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Markup
          </p>
          <MarkupField
            id="oh-pct"
            label="Overhead %"
            value={quote.overhead_pct}
            readOnly={readOnly}
            onChange={(overhead_pct) => onChange({ overhead_pct })}
          />
          <MarkupField
            id="profit-pct"
            label="Profit %"
            value={quote.profit_pct}
            readOnly={readOnly}
            onChange={(profit_pct) => onChange({ profit_pct })}
          />
          <MarkupField
            id="tax-pct"
            label="Sales tax %"
            value={quote.sales_tax_pct}
            readOnly={readOnly}
            step={0.01}
            onChange={(sales_tax_pct) => onChange({ sales_tax_pct })}
          />
        </div>

        <div className="space-y-1.5 border-t pt-3">
          {routine.linesSubtotal > 0 && (
            <div className="space-y-1 pb-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Line direct costs
              </p>
              <Row label="Material" value={routine.materialSubtotal} muted indent />
              <Row
                label="Hanger labor"
                value={routine.hangerLaborSubtotal}
                muted
                indent
                inclBurden={includeLaborBurden(quote.hanger_include_labor_burden)}
              />
              <Row
                label="Finisher labor"
                value={routine.finisherLaborSubtotal}
                muted
                indent
                inclBurden={includeLaborBurden(quote.finisher_include_labor_burden)}
              />
              <ComponentLaborRows
                byTrade={routine.componentLaborByTrade}
                inclBurden={includeLaborBurden(quote.component_include_labor_burden)}
              />
              {routine.accessoriesSubtotal > 0 && (
                <AccessorySubtotalRow
                  value={routine.accessoriesSubtotal}
                  items={summarizeAccessoryItems(
                    Object.values(routine.accessoryByCategory).flat(),
                  )}
                />
              )}
            </div>
          )}
          <Row label="Lines subtotal" value={routine.linesSubtotal} />
          <CleanupRow
            value={routine.cleanupTotal}
            sqft={routine.cleanupDrywallSqft}
            rate={routine.prepCleanRate}
            inclBurden={includeLaborBurden(quote.prep_clean_include_labor_burden)}
          />
          {routine.cleanupTotal > 0 && (
            <Row
              label="Subtotal before markup"
              value={markupBase}
              muted
            />
          )}
          <Row
            label={`Overhead (${formatPctLabel(quote.overhead_pct)}% of ${formatQuoteMoney(markupBase)})`}
            value={routine.overheadAmount}
            muted
          />
          <Row
            label={`Profit (${formatPctLabel(quote.profit_pct)}% of ${formatQuoteMoney(markupBase + routine.overheadAmount)})`}
            value={routine.profitAmount}
            muted
          />
          <Row
            label={`Sales tax (${formatPctLabel(quote.sales_tax_pct)}% on materials)`}
            value={routine.salesTaxAmount}
            muted
          />
          <Row label="Grand total" value={routine.total} strong />
          <MarginVsFloorRow
            marginPct={marginEval.marginPct}
            indicator={indicator}
            floorPctLabel={floorPctLabel}
          />
        </div>

        {alternates.length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
              Customer alternates
            </p>
            {alternates.map((alt) => (
              <Row key={alt.id} label={`Add: ${alt.name}`} value={alt.totalAdd} muted />
            ))}
          </div>
        )}

        {alternates.length > 0 && (
          <Row
            label="Grand total (all alternates)"
            value={grandTotalAllAlternates}
            strong
          />
        )}
      </CardContent>
    </Card>
  )
}

function MarginVsFloorRow({
  marginPct,
  indicator,
  floorPctLabel,
}: {
  marginPct: number | null
  indicator: ReturnType<typeof marginFloorIndicator>
  floorPctLabel: string
}) {
  const colorClass =
    indicator === 'red'
      ? 'text-red-600 dark:text-red-400'
      : indicator === 'yellow'
        ? 'text-amber-600 dark:text-amber-400'
        : indicator === 'green'
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-muted-foreground'

  const Icon = indicator === 'red' ? AlertTriangle : CheckCircle2

  return (
    <div className="flex items-start justify-between gap-2 border-t pt-2 mt-2 tabular-nums">
      <span className="flex items-center gap-1.5 font-medium">
        <Icon className={cn('h-4 w-4 shrink-0', colorClass)} />
        Margin vs Floor
      </span>
      <div className="text-right">
        <span className={cn('font-semibold', colorClass)}>{formatMarginFloorPct(marginPct)}</span>
        <p className="text-[10px] text-muted-foreground">(floor: {floorPctLabel})</p>
      </div>
    </div>
  )
}

function RateField({
  id,
  label,
  value,
  readOnly,
  step = 0.01,
  prefix,
  onChange,
}: {
  id: string
  label: string
  value: number
  readOnly: boolean
  step?: number
  prefix?: string
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {readOnly ? (
        <p className="tabular-nums text-sm font-medium">
          {prefix}
          {value}
        </p>
      ) : (
        <div className="relative">
          {prefix && (
            <span className="text-muted-foreground pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs">
              {prefix}
            </span>
          )}
          <Input
            id={id}
            type="number"
            min={0}
            step={step}
            className={prefix ? 'h-8 pl-5 tabular-nums' : 'h-8 tabular-nums'}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          />
        </div>
      )}
    </div>
  )
}

function MarkupField({
  id,
  label,
  value,
  readOnly,
  step = 0.1,
  onChange,
}: {
  id: string
  label: string
  value: number
  readOnly: boolean
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {readOnly ? (
        <p className="tabular-nums text-sm font-medium">{value}%</p>
      ) : (
        <Input
          id={id}
          type="number"
          min={0}
          step={step}
          className="h-8 tabular-nums"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
      )}
    </div>
  )
}

function AmountValue({ value, inclBurden }: { value: number; inclBurden?: boolean }) {
  const isZero = !Number.isFinite(value) || value === 0
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span>{formatQuoteMoney(value)}</span>
      {inclBurden && !isZero && (
        <span className="text-[9px] font-normal text-muted-foreground">incl. burden</span>
      )}
    </span>
  )
}

function CleanupRow({
  value,
  sqft,
  rate,
  inclBurden,
}: {
  value: number
  sqft: number
  rate: number
  inclBurden?: boolean
}) {
  const sqftLabel = sqft.toLocaleString('en-US', { maximumFractionDigits: 0 })
  const rateLabel = rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 })

  return (
    <div className="flex items-start justify-between gap-2 tabular-nums">
      <span className="text-muted-foreground">
        Cleanup labor
        {sqft > 0 && (
          <span className="text-muted-foreground/80"> ({sqftLabel} sqft × ${rateLabel})</span>
        )}
      </span>
      <AmountValue value={value} inclBurden={inclBurden} />
    </div>
  )
}

const COMPONENT_LABOR_LABELS: Array<{
  key: keyof QuoteV3ComponentLaborByTrade
  label: string
}> = [
  { key: 'rc_channel_labor', label: 'RC Channel Labor' },
  { key: 'suspended_grid_labor', label: 'Suspended Grid Labor' },
  { key: 'insulation_labor', label: 'Insulation Labor' },
  { key: 'acoustic_labor', label: 'Acoustic Ceiling Labor' },
  { key: 'metal_stud_labor', label: 'Metal Stud Labor' },
  { key: 'frp_labor', label: 'FRP Labor' },
]

function ComponentLaborRows({
  byTrade,
  inclBurden,
}: {
  byTrade: QuoteV3ComponentLaborByTrade
  inclBurden?: boolean
}) {
  return (
    <>
      {COMPONENT_LABOR_LABELS.map(({ key, label }) =>
        byTrade[key] > 0 ? (
          <Row key={key} label={label} value={byTrade[key]} muted indent inclBurden={inclBurden} />
        ) : null,
      )}
    </>
  )
}

function AccessorySubtotalRow({
  value,
  items,
}: {
  value: number
  items: ReturnType<typeof summarizeAccessoryItems>
}) {
  if (value <= 0) return null

  const label = (
    <span className="pl-3 text-xs text-muted-foreground underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
      Accessories
    </span>
  )

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-between gap-2 tabular-nums">
        {label}
        <span>{formatQuoteMoney(value)}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 tabular-nums">
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm">
            {label}
          </button>
        </PopoverTrigger>
        <PopoverContent side="left" align="start" className="w-80 p-3 text-xs">
          <p className="mb-2 font-medium">Project accessories</p>
          <ul className="space-y-1.5">
            {items.map((item) => (
              <li key={item.display_name} className="flex justify-between gap-2">
                <span className="text-muted-foreground">
                  {item.display_name}
                  <span className="block text-[10px]">
                    {item.units} {item.unit} × {formatQuoteMoney(item.unitRate)}
                  </span>
                </span>
                <span className="shrink-0 font-medium">{formatQuoteMoney(item.cost)}</span>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
      <span>{formatQuoteMoney(value)}</span>
    </div>
  )
}

function Row({
  label,
  value,
  muted,
  strong,
  indent,
  inclBurden,
}: {
  label: string
  value: number
  muted?: boolean
  strong?: boolean
  indent?: boolean
  inclBurden?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2 tabular-nums">
      <span
        className={[
          muted ? 'text-muted-foreground' : undefined,
          indent ? 'pl-3 text-xs' : undefined,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {label}
      </span>
      {inclBurden ? (
        <AmountValue value={value} inclBurden />
      ) : (
        <span className={strong ? 'text-base font-semibold' : undefined}>{formatQuoteMoney(value)}</span>
      )}
    </div>
  )
}

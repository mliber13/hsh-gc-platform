import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { includeLaborBurden } from '@/lib/drywall/calculations/quantityUtils'
import {
  evaluateMarginVsFloor,
  formatMarginFloorPct,
  marginFloorIndicator,
} from '@/lib/drywall/marginFloor'
import {
  computeDrywallDurationSummary,
  durationFinishFlags,
  parseDurationOverride,
} from '@/lib/drywall/durationService'
import { NumericInput } from '@/components/ui/numeric-input'
import { formatQuoteMoney, formatPctLabel } from '@/lib/drywall/quoteV3Math'
import type { QuoteV3TotalsSummary } from '@/lib/drywall/quoteV3Math'
import type { DrywallQuoteV3, QuoteLineItemType } from '@/types/drywall'
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

const TRADE_ORDER: { type: QuoteLineItemType; label: string }[] = [
  { type: 'drywall', label: 'Drywall' },
  { type: 'rc_channel', label: 'RC Channel' },
  { type: 'suspended_grid', label: 'Suspended Grid' },
  { type: 'metal_stud', label: 'Metal Stud' },
  { type: 'insulation', label: 'Insulation' },
  { type: 'acoustic', label: 'Acoustic Ceiling' },
  { type: 'frp', label: 'FRP' },
  { type: 'door_install', label: 'Door Install' },
]

export function QuoteTotalsSidebar({ quote, totals, catalogs, readOnly, onChange }: Props) {
  const { routine, alternates, grandTotalAllAlternates, acceptedTotal, acceptedSqft } = totals

  // Same figure the PDF prints, so what he checks here is what the customer gets.
  const durationSummary = useMemo(() => {
    const { hasLevel5, hasTexture } = durationFinishFlags([
      quote.ceiling_finish,
      quote.ceiling_finish_other,
      quote.wall_finish,
      quote.wall_finish_other,
    ])
    return computeDrywallDurationSummary({
      drywallSqft: totals.totalSqft,
      beadSticks: Number(quote.bead_sticks) || 0,
      buildType: String(quote.build_type ?? 'new_build'),
      complexity: String(quote.complexity ?? 'normal'),
      hasLevel5,
      hasTexture,
      paperFloorsRequired: Boolean(quote.paper_floors_required),
      overrides: quote.duration_overrides,
    })
  }, [
    quote.ceiling_finish,
    quote.ceiling_finish_other,
    quote.wall_finish,
    quote.wall_finish_other,
    quote.bead_sticks,
    quote.build_type,
    quote.complexity,
    quote.paper_floors_required,
    quote.duration_overrides,
    totals.totalSqft,
  ])

  const setDurationOverride = (key: string, raw: string) => {
    const next = { ...(quote.duration_overrides ?? {}) }
    const parsed = parseDurationOverride(raw)
    // Clearing the field is how you go back to the calculated number, so an
    // unusable value removes the override rather than storing a zero.
    if (parsed === null) delete next[key]
    else next[key] = parsed
    onChange({ duration_overrides: Object.keys(next).length > 0 ? next : undefined })
  }
  const anyAccepted = alternates.some((a) => a.selected)
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
            <div className="space-y-2 pb-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Line direct costs
              </p>
              {TRADE_ORDER.map(({ type, label }) => {
                const t = routine.byTrade?.[type]
                if (!t) return null
                const subtotal =
                  t.material + t.hangerLabor + t.finisherLabor + t.componentLabor + t.accessories
                if (subtotal <= 0) return null
                return (
                  <div key={type} className="space-y-0.5 rounded-md border bg-muted/20 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                      <span>{label}</span>
                      <span className="tabular-nums">{formatQuoteMoney(subtotal)}</span>
                    </div>
                    {t.material > 0 && <Row label="Material" value={t.material} muted indent />}
                    {type === 'drywall' ? (
                      <>
                        {t.hangerLabor > 0 && (
                          <Row
                            label="Hanger labor"
                            value={t.hangerLabor}
                            muted
                            indent
                            inclBurden={includeLaborBurden(quote.hanger_include_labor_burden)}
                          />
                        )}
                        {t.finisherLabor > 0 && (
                          <Row
                            label="Finisher labor"
                            value={t.finisherLabor}
                            muted
                            indent
                            inclBurden={includeLaborBurden(quote.finisher_include_labor_burden)}
                          />
                        )}
                      </>
                    ) : (
                      t.componentLabor > 0 && (
                        <Row
                          label="Labor"
                          value={t.componentLabor}
                          muted
                          indent
                          inclBurden={includeLaborBurden(quote.component_include_labor_burden)}
                        />
                      )
                    )}
                    {t.accessories > 0 && (
                      <Row label="Accessories" value={t.accessories} muted indent />
                    )}
                  </div>
                )
              })}
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
              <Row
                key={alt.id}
                label={`${alt.selected ? '✓ ' : '○ '}${alt.pricingMode === 'deduct' ? 'Deduct' : 'Add'}: ${alt.name}`}
                value={
                  alt.pricingMode === 'deduct' ? -Math.abs(alt.totalAdd) : Math.abs(alt.totalAdd)
                }
                muted={!alt.selected}
              />
            ))}
          </div>
        )}

        {anyAccepted ? (
          <div className="space-y-1 border-t pt-3">
            <Row label="Contract total (accepted)" value={acceptedTotal} strong />
            <div className="flex items-center justify-between gap-2 text-sm tabular-nums">
              <span className="font-medium">Estimate sqft (accepted)</span>
              <span className="font-semibold">
                {acceptedSqft.toLocaleString(undefined, { maximumFractionDigits: 2 })} sqft
              </span>
            </div>
          </div>
        ) : alternates.length > 0 ? (
          <Row label="Grand total (all alternates)" value={grandTotalAllAlternates} strong />
        ) : null}

        {totals.totalSqft > 0 && (
          <div className="space-y-1 border-t pt-3">
            <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
              Drywall duration summary
            </p>
            {durationSummary.lines.map((line) => (
              <div key={line.key} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-muted-foreground" title={line.label}>
                  {line.label}
                </span>
                {readOnly ? (
                  <span className="tabular-nums">
                    {line.days} day{line.days !== 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1">
                    <NumericInput
                      aria-label={`${line.label} days`}
                      className={cn(
                        'h-7 w-14 px-2 text-right text-sm tabular-nums',
                        line.overridden && 'border-primary font-medium',
                      )}
                      placeholder={String(line.derivedDays)}
                      value={line.overridden ? String(line.days) : ''}
                      onChange={(e) => setDurationOverride(line.key, e.target.value)}
                    />
                    <span className="w-8 text-xs text-muted-foreground">
                      day{line.days !== 1 ? 's' : ''}
                    </span>
                    <button
                      type="button"
                      title={`Back to calculated (${line.derivedDays})`}
                      aria-label={`Reset ${line.label} to calculated days`}
                      className={cn(
                        'text-muted-foreground hover:text-foreground',
                        !line.overridden && 'invisible',
                      )}
                      onClick={() => setDurationOverride(line.key, '')}
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>
            ))}
            <div className="flex justify-between gap-2 border-t border-border/50 pt-2 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{durationSummary.totalDays} working days</span>
            </div>
            {!readOnly && (
              <p className="pt-1 text-xs text-muted-foreground">
                Calculated from sqft and scope. Type over any step if you know something the
                estimator doesn't; clear the box to go back to the calculated number.
              </p>
            )}
            <p className="pt-1 text-xs text-muted-foreground">{durationSummary.assumptions}</p>
          </div>
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

// The quote's money, split out of the old right-hand sidebar (Mark, 2026-10-14: "messy";
// total, margin and floor needed "almost anywhere I am editing lines").
//
//   QuoteSummaryBar          — total · cost · margin vs floor, pinned while scrolling; the
//                              line-edit dialog shows the same numbers (QuoteSummaryLine)
//   QuotePricingCard         — rates and markup, always editable, beside the cost breakdown
//                              (direct costs by trade as WAGES, one labour-burden line)
//   QuoteDurationCard        — the duration summary, foldable
//
// The numbers come from quoteMoneySummary.ts; the pricing engine is unchanged.

import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { NumericInput } from '@/components/ui/numeric-input'
import { formatMarginFloorPct } from '@/lib/drywall/marginFloor'
import { LABOR_TAX_RATE } from '@/lib/drywall/calculations/quantityUtils'
import {
  computeDrywallDurationSummary,
  durationFinishFlags,
  parseDurationOverride,
} from '@/lib/drywall/durationService'
import { formatPctLabel, formatQuoteMoney, type QuoteV3TotalsSummary } from '@/lib/drywall/quoteV3Math'
import { quoteCostBreakdown, type QuoteMoneySummary } from '@/lib/drywall/quoteMoneySummary'
import { HEIGHT_BAND_LABEL, quoteTallSqftByBand } from '@/lib/drywall/ceilingHeights'
import { HEIGHT_BANDS, TALL_WALL_LABOR_DEFAULT, tallWallLaborRates } from '@/lib/drywall/tallWallPricing'
import type { DrywallQuoteV3 } from '@/types/drywall'
import { cn } from '@/lib/utils'

function marginColor(indicator: QuoteMoneySummary['indicator']): string {
  return indicator === 'red'
    ? 'text-red-600 dark:text-red-400'
    : indicator === 'yellow'
      ? 'text-amber-600 dark:text-amber-400'
      : indicator === 'green'
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-muted-foreground'
}

/** The three numbers, inline — shared by the pinned bar and the line-edit dialog. */
export function QuoteSummaryLine({
  summary,
  deltaTotal,
  className,
  onMarginClick,
}: {
  summary: QuoteMoneySummary
  /** In the line dialog: how much the edit moves the total. */
  deltaTotal?: number
  className?: string
  /** In the floating bar: margin is the way into the rates and markup. */
  onMarginClick?: () => void
}) {
  const Icon = summary.indicator === 'red' ? AlertTriangle : CheckCircle2
  const total = summary.contractTotal ?? summary.total
  return (
    <div className={cn('flex flex-wrap items-center gap-x-5 gap-y-1 text-sm tabular-nums', className)}>
      <span>
        <span className="text-muted-foreground">{summary.contractTotal != null ? 'Contract ' : 'Total '}</span>
        <span className="text-base font-semibold">{formatQuoteMoney(total)}</span>
        {deltaTotal != null && Math.abs(deltaTotal) >= 0.5 ? (
          <span className={cn('ml-1 text-xs', deltaTotal > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
            ({deltaTotal > 0 ? '+' : '−'}
            {formatQuoteMoney(Math.abs(deltaTotal))})
          </span>
        ) : null}
      </span>
      {summary.sqftWithWaste > 0 ? (
        <span>
          <span className="font-medium">{Math.round(summary.sqft).toLocaleString()}</span>
          <span className="text-muted-foreground"> sqft · </span>
          <span className="font-medium">{Math.round(summary.sqftWithWaste).toLocaleString()}</span>
          <span className="text-muted-foreground"> w/ waste</span>
        </span>
      ) : null}
      {summary.pricePerSqft != null ? (
        <span>
          <span className="font-medium">{formatQuoteMoney(summary.pricePerSqft)}</span>
          <span className="text-muted-foreground">/sqft</span>
        </span>
      ) : null}
      <span>
        <span className="text-muted-foreground">Cost </span>
        <span className="font-medium">{formatQuoteMoney(summary.cost)}</span>
      </span>
      <span
        className={cn('inline-flex items-center gap-1.5', onMarginClick && 'cursor-pointer rounded-md px-1 -mx-1 hover:bg-muted')}
        role={onMarginClick ? 'button' : undefined}
        tabIndex={onMarginClick ? 0 : undefined}
        title={onMarginClick ? 'Rates & markup' : undefined}
        onClick={onMarginClick}
        onKeyDown={onMarginClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMarginClick() } } : undefined}
      >
        <Icon className={cn('size-4', marginColor(summary.indicator))} />
        <span className="text-muted-foreground">Margin </span>
        <span className={cn('font-semibold', marginColor(summary.indicator))}>
          {formatMarginFloorPct(summary.marginPct)}
        </span>
        <span className="text-xs text-muted-foreground">floor {(summary.floorPct * 100).toFixed(0)}%</span>
      </span>
    </div>
  )
}

/**
 * Floats at the bottom of the screen. Not `sticky`: the app's content wrapper is
 * `overflow-auto` with no fixed height, so it never scrolls itself — the window does — and a
 * sticky child pins to a box that never moves (Mark, 2026-10-14: "doesn't seem to be scrolling
 * with me"). `fixed` ignores those ancestors. Sized to its content and centred, so it clears
 * the sidebar; the page adds bottom padding so the last section is not hidden behind it.
 */
export function QuoteSummaryBar({ summary, onMarginClick }: { summary: QuoteMoneySummary; onMarginClick?: () => void }) {
  return (
    <div className="fixed bottom-4 left-1/2 z-40 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl border bg-background/95 px-5 py-2.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <QuoteSummaryLine summary={summary} onMarginClick={onMarginClick} />
    </div>
  )
}

/**
 * Values with a real "usual" across live quotes (2026-10-14, 88 v3 quotes): cleanup $0.03 (68),
 * overhead 10% (70), profit 30% (52). A different value gets a marker, so a job-specific choice —
 * or a slip — is visible at a glance. Hanger and finisher rates are priced per job ($0.27–$0.55)
 * and sales tax follows the job's location (6.75% ×43, 7.25% ×36), so they carry none.
 */
const USUAL: Partial<Record<'prep_clean_rate' | 'overhead_pct' | 'profit_pct', number>> = {
  prep_clean_rate: 0.03,
  overhead_pct: 10,
  profit_pct: 30,
}

const PRICING_ANCHOR_ID = 'quote-pricing'

/** Scroll the pricing card into view — the floating bar's margin links here. */
export function scrollToQuoteRates() {
  document.getElementById(PRICING_ANCHOR_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const trimNumber = (n: number) => String(Number(n.toFixed(4)))

/**
 * One rate or percentage, always editable. Holds its own text while focused, so "0." or a
 * cleared box survives the keystroke instead of snapping back to a number mid-typing.
 */
function RateField({
  id,
  label,
  value,
  readOnly,
  prefix,
  suffix,
  usual,
  onChange,
}: {
  id: string
  label: string
  value: number
  readOnly: boolean
  prefix?: string
  suffix?: string
  usual?: number
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const changed = usual != null && Math.abs(value - usual) > 1e-9
  const usualText = usual != null ? `${prefix ?? ''}${trimNumber(usual)}${suffix ?? ''}` : ''

  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id} className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
        {label}
        {changed ? (
          <span
            className="size-1.5 rounded-full bg-amber-500"
            title={`Usual: ${usualText}`}
            aria-label={`Changed from usual ${usualText}`}
          />
        ) : null}
      </Label>
      <div className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {prefix}
          </span>
        ) : null}
        <NumericInput
          id={id}
          disabled={readOnly}
          className={cn(
            'h-8 text-right tabular-nums',
            prefix && 'pl-5',
            suffix && 'pr-6',
            changed && 'border-amber-500/60 bg-amber-500/10',
          )}
          title={changed ? `Usual: ${usualText}` : undefined}
          value={draft ?? trimNumber(value)}
          onFocus={() => setDraft(trimNumber(value))}
          onBlur={() => setDraft(null)}
          onChange={(e) => {
            setDraft(e.target.value)
            onChange(parseFloat(e.target.value) || 0)
          }}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</legend>
      <div className="grid grid-cols-3 gap-2">{children}</div>
    </fieldset>
  )
}

function Row({ label, value, muted, strong, indent }: { label: string; value: number; muted?: boolean; strong?: boolean; indent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 tabular-nums">
      <span className={cn(muted && 'text-muted-foreground', indent && 'pl-3 text-xs')}>{label}</span>
      <span className={cn(strong ? 'text-base font-semibold' : undefined, indent && 'text-xs')}>{formatQuoteMoney(value)}</span>
    </div>
  )
}

function CostBreakdown({ quote, totals }: { quote: DrywallQuoteV3; totals: QuoteV3TotalsSummary }) {
  const { routine, alternates } = totals
  const breakdown = useMemo(() => quoteCostBreakdown(quote, totals), [quote, totals])
  const markupBase = routine.markupBase
  const anyAccepted = alternates.some((a) => a.selected)

  return (
    <div className="grid gap-6 text-sm md:grid-cols-2">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Direct costs by trade</p>
        {breakdown.trades.map((t) => (
          <div key={t.type} className="rounded-md border bg-muted/20 px-2 py-1.5">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold">
              <span>{t.label}</span>
              <span className="tabular-nums">{formatQuoteMoney(t.subtotal)}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
              {(
                [
                  ['Material', t.material],
                  ['Hanger', t.hangerWages],
                  ['Finisher', t.finisherWages],
                  ['Labor', t.componentWages],
                  ['Accessories', t.accessories],
                ] as const
              )
                .filter(([, v]) => v > 0)
                .map(([label, v]) => (
                  <span key={label}>
                    {label} <span className="text-foreground">{formatQuoteMoney(v)}</span>
                  </span>
                ))}
            </div>
          </div>
        ))}
        {breakdown.cleanupWages > 0 ? (
          <Row
            label={`Cleanup labor (${routine.cleanupDrywallSqft.toLocaleString('en-US', { maximumFractionDigits: 0 })} sqft × ${routine.prepCleanRate})`}
            value={breakdown.cleanupWages}
            muted
          />
        ) : null}
        {breakdown.tallWallWages > 0 ? (
          <Row
            label={`Tall-wall labor (${Object.values(quoteTallSqftByBand(quote))
              .reduce((a, b) => a + (b ?? 0), 0)
              .toLocaleString('en-US', { maximumFractionDigits: 0 })} sqft 10' and up)`}
            value={breakdown.tallWallWages}
            muted
          />
        ) : null}
        {breakdown.laborBurden > 0 ? (
          <Row label={`Labor burden (${Math.round(LABOR_TAX_RATE * 100)}% on wages)`} value={breakdown.laborBurden} muted />
        ) : null}
      </div>

      <div className="space-y-1.5 border-t pt-3 md:border-l md:border-t-0 md:pl-6 md:pt-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Totals</p>
        <Row label="Direct cost before markup" value={markupBase} />
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
        <Row label={`Sales tax (${formatPctLabel(quote.sales_tax_pct)}% on materials)`} value={routine.salesTaxAmount} muted />
        <div className="border-t pt-1.5">
          <Row label="Grand total" value={routine.total} strong />
        </div>
        {alternates.length > 0 ? (
          <div className="space-y-1 border-t pt-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer alternates</p>
            {alternates.map((alt) => (
              <Row
                key={alt.id}
                label={`${alt.selected ? '✓ ' : '○ '}${alt.pricingMode === 'deduct' ? 'Deduct' : 'Add'}: ${alt.name}`}
                value={alt.pricingMode === 'deduct' ? -Math.abs(alt.totalAdd) : Math.abs(alt.totalAdd)}
                muted={!alt.selected}
              />
            ))}
            {anyAccepted ? (
              <>
                <Row label="Contract total (accepted)" value={totals.acceptedTotal} strong />
                <p className="text-right text-xs text-muted-foreground tabular-nums">
                  {totals.acceptedSqft.toLocaleString(undefined, { maximumFractionDigits: 2 })} sqft accepted
                </p>
              </>
            ) : (
              <Row label="Grand total (all alternates)" value={totals.grandTotalAllAlternates} strong />
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Rates and markup beside the cost breakdown they drive (Mark, 2026-10-15: "I like to see the
 * breakdown while I adjust rates"; the Edit button was "annoying"). The inputs are always live
 * — a locked quote disables them and says why — and the breakdown recomputes as you type.
 * Replaces the separate Rates & markup strip and Cost breakdown card.
 */
export function QuotePricingCard({
  quote,
  totals,
  readOnly,
  lockedNote,
  onChange,
}: {
  quote: DrywallQuoteV3
  totals: QuoteV3TotalsSummary
  readOnly: boolean
  /** Why the inputs are disabled — a sent or approved quote is locked, which looks broken unsaid. */
  lockedNote?: string | null
  onChange: (patch: Partial<DrywallQuoteV3>) => void
}) {
  return (
    <div id={PRICING_ANCHOR_ID} className="scroll-mt-4 rounded-lg border border-l-4 border-l-primary bg-card shadow-sm">
      <div className="px-4 py-2 text-sm font-semibold">Pricing</div>
      {lockedNote ? (
        <p className="border-t border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          {lockedNote}
        </p>
      ) : null}
      <div className="grid gap-6 border-t px-4 py-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-1 xl:border-r xl:pr-6">
          <Group title="Labor rates ($/sqft)">
            <RateField id="project-hanger-rate" label="Hanger" value={Number(quote.project_hanger_rate ?? 0)} readOnly={readOnly} prefix="$" onChange={(project_hanger_rate) => onChange({ project_hanger_rate })} />
            <RateField id="project-finisher-rate" label="Finisher" value={Number(quote.project_finisher_rate ?? 0)} readOnly={readOnly} prefix="$" onChange={(project_finisher_rate) => onChange({ project_finisher_rate })} />
            <RateField id="prep-clean-rate" label="Cleanup" value={Number(quote.prep_clean_rate ?? 0)} readOnly={readOnly} prefix="$" usual={USUAL.prep_clean_rate} onChange={(prep_clean_rate) => onChange({ prep_clean_rate })} />
          </Group>
          {/* Only on a quote with tall board — 10' and up (ceilingHeights.ts, tallWallPricing.ts). */}
          {Object.values(quoteTallSqftByBand(quote)).some((n) => (n ?? 0) > 0) ? (
            <Group title="Tall-wall labor ($/sqft)">
              {HEIGHT_BANDS.map((band) => (
                <RateField
                  key={band}
                  id={`tall-wall-${band}`}
                  label={HEIGHT_BAND_LABEL[band]}
                  value={tallWallLaborRates(quote)[band]}
                  readOnly={readOnly}
                  prefix="$"
                  usual={TALL_WALL_LABOR_DEFAULT[band]}
                  onChange={(v) =>
                    onChange({ tall_wall_labor_rates: { ...(quote.tall_wall_labor_rates ?? {}), [band]: v } })
                  }
                />
              ))}
            </Group>
          ) : null}
          <Group title="Markup & tax">
            <RateField id="oh-pct" label="Overhead" value={Number(quote.overhead_pct ?? 0)} readOnly={readOnly} suffix="%" usual={USUAL.overhead_pct} onChange={(overhead_pct) => onChange({ overhead_pct })} />
            <RateField id="profit-pct" label="Profit" value={Number(quote.profit_pct ?? 0)} readOnly={readOnly} suffix="%" usual={USUAL.profit_pct} onChange={(profit_pct) => onChange({ profit_pct })} />
            <RateField id="tax-pct" label="Sales tax" value={Number(quote.sales_tax_pct ?? 0)} readOnly={readOnly} suffix="%" onChange={(sales_tax_pct) => onChange({ sales_tax_pct })} />
          </Group>
        </div>
        <CostBreakdown quote={quote} totals={totals} />
      </div>
    </div>
  )
}

export function QuoteDurationCard({
  quote,
  totals,
  readOnly,
  onChange,
}: {
  quote: DrywallQuoteV3
  totals: QuoteV3TotalsSummary
  readOnly: boolean
  onChange: (patch: Partial<DrywallQuoteV3>) => void
}) {
  const [open, setOpen] = useState(false)
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
      // Hourly labor lines add their own step here; the customer PDF leaves them out.
      laborHours: quote.lineItems
        .filter((l) => l.type === 'labor_hours')
        .reduce((sum, l) => sum + (Number(l.quantity) || 0), 0),
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
    quote.lineItems,
    totals.totalSqft,
  ])

  // Nothing to schedule: no drywall and no hourly labor.
  if (totals.totalSqft <= 0 && !quote.lineItems.some((l) => l.type === 'labor_hours')) return null

  const setDurationOverride = (key: string, raw: string) => {
    const next = { ...(quote.duration_overrides ?? {}) }
    const parsed = parseDurationOverride(raw)
    // Clearing the field is how you go back to the calculated number, so an unusable value
    // removes the override rather than storing a zero.
    if (parsed === null) delete next[key]
    else next[key] = parsed
    onChange({ duration_overrides: Object.keys(next).length > 0 ? next : undefined })
  }

  return (
    <Card>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-6 py-4 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <span className="font-semibold">Duration</span>
        <span className="text-sm text-muted-foreground">· {durationSummary.totalDays} working days</span>
      </button>
      {open ? (
        <CardContent className="space-y-1 text-sm">
          {durationSummary.lines.map((line) => (
            <div key={line.key} className="flex items-center justify-between gap-2">
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
                    className={cn('h-7 w-14 px-2 text-right text-sm tabular-nums', line.overridden && 'border-primary font-medium')}
                    placeholder={String(line.derivedDays)}
                    value={line.overridden ? String(line.days) : ''}
                    onChange={(e) => setDurationOverride(line.key, e.target.value)}
                  />
                  <span className="w-8 text-xs text-muted-foreground">day{line.days !== 1 ? 's' : ''}</span>
                  <button
                    type="button"
                    title={`Back to calculated (${line.derivedDays})`}
                    aria-label={`Reset ${line.label} to calculated days`}
                    className={cn('text-muted-foreground hover:text-foreground', !line.overridden && 'invisible')}
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
              Calculated from sqft and scope. Type over any step if you know something the estimator
              doesn&apos;t; clear the box to go back to the calculated number.
            </p>
          )}
          <p className="pt-1 text-xs text-muted-foreground">{durationSummary.assumptions}</p>
        </CardContent>
      ) : null}
    </Card>
  )
}

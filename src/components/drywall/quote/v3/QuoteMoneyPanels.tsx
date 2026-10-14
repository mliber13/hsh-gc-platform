// The quote's money, split out of the old right-hand sidebar (Mark, 2026-10-14: "messy";
// total, margin and floor needed "almost anywhere I am editing lines").
//
//   QuoteSummaryBar          — total · cost · margin vs floor, pinned while scrolling; the
//                              line-edit dialog shows the same numbers (QuoteSummaryLine)
//   QuoteRatesMarkupPanel    — project rates and markup inputs, next to the bar
//   QuoteCostBreakdownCard   — direct costs by trade as WAGES, one labour-burden line
//   QuoteDurationCard        — the duration summary, foldable
//
// The numbers come from quoteMoneySummary.ts; the pricing engine is unchanged.

import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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

function NumberField({
  id,
  label,
  value,
  readOnly,
  step,
  prefix,
  suffix,
  onChange,
}: {
  id: string
  label: string
  value: number
  readOnly: boolean
  step: number
  prefix?: string
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {readOnly ? (
        <p className="text-sm font-medium tabular-nums">
          {prefix}
          {value}
          {suffix}
        </p>
      ) : (
        <div className="relative">
          {prefix ? (
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {prefix}
            </span>
          ) : null}
          <Input
            id={id}
            type="number"
            min={0}
            step={step}
            className={cn('h-8 tabular-nums', prefix && 'pl-5', suffix && 'pr-6')}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          />
          {suffix ? (
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {suffix}
            </span>
          ) : null}
        </div>
      )}
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

function Value({
  text,
  usual,
  current,
  usualText,
}: {
  text: string
  usual?: number
  current: number
  usualText?: string
}) {
  const changed = usual != null && Math.abs(current - usual) > 1e-9
  // A chip, so the value reads as data rather than grey label text (Mark: "need to stand out");
  // amber when it differs from the usual.
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-sm font-semibold tabular-nums',
        changed
          ? 'border-amber-500/50 bg-amber-500/15 text-amber-900 dark:text-amber-100'
          : 'border-border bg-background text-foreground',
      )}
      title={changed ? `Usual: ${usualText}` : undefined}
    >
      {text}
      {changed ? <span className="size-1.5 rounded-full bg-amber-500" aria-label={`Changed from usual ${usualText}`} /> : null}
    </span>
  )
}

const RATES_ANCHOR_ID = 'quote-rates-markup'

/** Scroll the rates section into view — the floating bar's margin links here. */
export function scrollToQuoteRates() {
  document.getElementById(RATES_ANCHOR_ID)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

/**
 * Rates & markup — one read-only line until Edit (Mark, 2026-10-14: "spread out", "something
 * that could be accidentally messed with"). Editing is deliberate; the floating bar updates
 * live while it is open, so a profit nudge shows its margin as it is typed.
 */
export function QuoteRatesMarkupPanel({
  quote,
  readOnly,
  lockedNote,
  open,
  onOpenChange,
  onChange,
}: {
  quote: DrywallQuoteV3
  readOnly: boolean
  /** Why the inputs are text — a sent or approved quote is locked, which looks broken unsaid. */
  lockedNote?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (patch: Partial<DrywallQuoteV3>) => void
}) {
  const money = (n: number | undefined) => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`
  const pct = (n: number | undefined) => `${Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`
  const editing = open && !readOnly

  return (
    <div id={RATES_ANCHOR_ID} className="scroll-mt-4 rounded-lg border border-l-4 border-l-primary bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 text-sm">
        <span className="font-semibold">Rates &amp; markup</span>
        {!editing ? (
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            <span>
              Hanger <Value text={money(quote.project_hanger_rate)} current={Number(quote.project_hanger_rate ?? 0)} />
            </span>
            <span>
              Finisher <Value text={money(quote.project_finisher_rate)} current={Number(quote.project_finisher_rate ?? 0)} />
            </span>
            <span>
              Cleanup{' '}
              <Value text={money(quote.prep_clean_rate)} current={Number(quote.prep_clean_rate ?? 0)} usual={USUAL.prep_clean_rate} usualText={money(USUAL.prep_clean_rate)} />
            </span>
            <span className="text-border">│</span>
            <span>
              OH <Value text={pct(quote.overhead_pct)} current={Number(quote.overhead_pct ?? 0)} usual={USUAL.overhead_pct} usualText={pct(USUAL.overhead_pct)} />
            </span>
            <span>
              Profit <Value text={pct(quote.profit_pct)} current={Number(quote.profit_pct ?? 0)} usual={USUAL.profit_pct} usualText={pct(USUAL.profit_pct)} />
            </span>
            <span className="text-border">│</span>
            <span>
              Tax <Value text={pct(quote.sales_tax_pct)} current={Number(quote.sales_tax_pct ?? 0)} />
            </span>
          </span>
        ) : (
          <span className="flex-1 text-xs text-muted-foreground">The money bar below updates as you type.</span>
        )}
        {!readOnly ? (
          <Button type="button" size="sm" variant={editing ? 'default' : 'outline'} className="ml-auto h-7" onClick={() => onOpenChange(!editing)}>
            {editing ? 'Done' : 'Edit'}
          </Button>
        ) : null}
      </div>

      {lockedNote ? (
        <p className="border-t border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          {lockedNote}
        </p>
      ) : null}

      {editing ? (
        <div className="grid gap-4 border-t px-3 py-3 md:grid-cols-[3fr_2fr_1fr]">
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Labor rates ($/sqft)</legend>
            <div className="grid grid-cols-3 gap-2">
              <NumberField id="project-hanger-rate" label="Hanger" value={quote.project_hanger_rate ?? 0} readOnly={false} step={0.001} prefix="$" onChange={(project_hanger_rate) => onChange({ project_hanger_rate })} />
              <NumberField id="project-finisher-rate" label="Finisher" value={quote.project_finisher_rate ?? 0} readOnly={false} step={0.001} prefix="$" onChange={(project_finisher_rate) => onChange({ project_finisher_rate })} />
              <NumberField id="prep-clean-rate" label="Cleanup" value={quote.prep_clean_rate} readOnly={false} step={0.001} prefix="$" onChange={(prep_clean_rate) => onChange({ prep_clean_rate })} />
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Markup</legend>
            <div className="grid grid-cols-2 gap-2">
              <NumberField id="oh-pct" label="Overhead" value={quote.overhead_pct} readOnly={false} step={0.1} suffix="%" onChange={(overhead_pct) => onChange({ overhead_pct })} />
              <NumberField id="profit-pct" label="Profit" value={quote.profit_pct} readOnly={false} step={0.1} suffix="%" onChange={(profit_pct) => onChange({ profit_pct })} />
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tax</legend>
            <NumberField id="tax-pct" label="Sales tax" value={quote.sales_tax_pct} readOnly={false} step={0.01} suffix="%" onChange={(sales_tax_pct) => onChange({ sales_tax_pct })} />
          </fieldset>
        </div>
      ) : null}
    </div>
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

export function QuoteCostBreakdownCard({ quote, totals }: { quote: DrywallQuoteV3; totals: QuoteV3TotalsSummary }) {
  const { routine, alternates } = totals
  const breakdown = useMemo(() => quoteCostBreakdown(quote, totals), [quote, totals])
  const markupBase = routine.markupBase
  const anyAccepted = alternates.some((a) => a.selected)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Cost breakdown</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 text-sm lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Direct costs by trade</p>
          {breakdown.trades.map((t) => (
            <div key={t.type} className="space-y-0.5 rounded-md border bg-muted/20 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                <span>{t.label}</span>
                <span className="tabular-nums">{formatQuoteMoney(t.subtotal)}</span>
              </div>
              {t.material > 0 && <Row label="Material" value={t.material} muted indent />}
              {t.hangerWages > 0 && <Row label="Hanger labor" value={t.hangerWages} muted indent />}
              {t.finisherWages > 0 && <Row label="Finisher labor" value={t.finisherWages} muted indent />}
              {t.componentWages > 0 && <Row label="Labor" value={t.componentWages} muted indent />}
              {t.accessories > 0 && <Row label="Accessories" value={t.accessories} muted indent />}
            </div>
          ))}
          {breakdown.cleanupWages > 0 ? (
            <Row
              label={`Cleanup labor (${routine.cleanupDrywallSqft.toLocaleString('en-US', { maximumFractionDigits: 0 })} sqft × $${routine.prepCleanRate})`}
              value={breakdown.cleanupWages}
              muted
            />
          ) : null}
          {breakdown.laborBurden > 0 ? (
            <Row label={`Labor burden (${Math.round(LABOR_TAX_RATE * 100)}% on wages)`} value={breakdown.laborBurden} muted />
          ) : null}
        </div>

        <div className="space-y-1.5">
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
      </CardContent>
    </Card>
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

  if (totals.totalSqft <= 0) return null

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

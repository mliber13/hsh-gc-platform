import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { CheckCircle2, Clock, TrendingUp, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { usePermissions } from '@/hooks/usePermissions'
import { canWriteDrywallProject } from '@/routes/RequirePermission'
import {
  buildOrderFinancialComparison,
  resolveOrderBaselineRates,
  type OrderLaborRateSet,
  type OrderReviewLaborRatesInput,
} from '@/lib/drywall/orderFinancialComparison'
import { projectV3QuoteToV2Shape } from '@/lib/drywall/projectV3QuoteToV2Shape'
import type {
  DrywallChangeOrder,
  DrywallQuote,
  DrywallQuoteV2V3,
  FieldTakeoff,
  LaborRateAdjustmentLogEntry,
} from '@/types/drywall'
import { isDrywallQuoteV3 } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

function rateMoney(n: number): string {
  return money(n) + '/sqft'
}

function asStoredRateRecord(r: OrderLaborRateSet | Record<string, unknown>): Record<string, unknown> {
  return {
    hangerRate: Number((r as OrderLaborRateSet).hangerRate),
    finisherRate: Number((r as OrderLaborRateSet).finisherRate),
    prepCleanRate: Number((r as OrderLaborRateSet).prepCleanRate),
  }
}

function changeClass(change: string): string {
  if (change.startsWith('+') && change !== '+0' && change !== '+$0.00') {
    return 'text-emerald-600 dark:text-emerald-400'
  }
  if (change.startsWith('-')) return 'text-red-600 dark:text-red-400'
  return 'text-muted-foreground'
}

function rateTriple(hanger: number, finisher: number, prepClean: number) {
  return { hanger, finisher, prepClean }
}

function ratesChanged(
  from: { hanger: number; finisher: number; prepClean: number },
  to: { hanger: number; finisher: number; prepClean: number },
): boolean {
  const eq = (a: number, b: number) => Math.abs(a - b) > 0.00005
  return eq(from.hanger, to.hanger) || eq(from.finisher, to.finisher) || eq(from.prepClean, to.prepClean)
}

function parseRateAdjustmentLog(raw: unknown): LaborRateAdjustmentLogEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((entry): entry is LaborRateAdjustmentLogEntry => {
    if (!entry || typeof entry !== 'object') return false
    const o = entry as LaborRateAdjustmentLogEntry
    return (
      typeof o.at === 'string' &&
      typeof o.byUserId === 'string' &&
      typeof o.byName === 'string' &&
      typeof o.reason === 'string' &&
      typeof o.marginAtChange === 'number' &&
      typeof o.sqftVarianceAtChange === 'number' &&
      o.from != null &&
      o.to != null &&
      typeof o.from.hanger === 'number' &&
      typeof o.to.hanger === 'number'
    )
  })
}

function formatLogWhen(iso: string): string {
  try {
    return format(parseISO(iso), 'MMM d, yyyy h:mm a')
  } catch {
    return iso
  }
}

interface Props {
  quote: DrywallQuoteV2V3 | DrywallQuote | null
  fieldTakeoff: FieldTakeoff | null
  changeOrders: DrywallChangeOrder[]
  readOnly: boolean
  catalogs?: OrgDrywallCatalogs | null
  onSaveFieldTakeoff: (takeoff: FieldTakeoff) => Promise<void>
}

export function LaborRateAdjustmentsCard({
  quote,
  fieldTakeoff,
  changeOrders,
  readOnly,
  catalogs = null,
  onSaveFieldTakeoff,
}: Props) {
  const { profile, effectiveRole } = usePermissions()
  const [saving, setSaving] = useState(false)
  const [laborRates, setLaborRates] = useState<OrderReviewLaborRatesInput>({
    hangerRate: '',
    finisherRate: '',
    prepCleanRate: '',
    reviewNotes: '',
  })

  const v3Quote = quote && isDrywallQuoteV3(quote) ? quote : null
  const v2Quote = useMemo<DrywallQuote | null>(() => {
    if (!quote) return null
    if (isDrywallQuoteV3(quote)) {
      return catalogs ? projectV3QuoteToV2Shape(quote, catalogs) : null
    }
    return quote
  }, [quote, catalogs])

  const baselineRates = useMemo(
    () => (v2Quote && fieldTakeoff ? resolveOrderBaselineRates(v2Quote, fieldTakeoff) : null),
    [v2Quote, fieldTakeoff],
  )

  const approvedRates = fieldTakeoff?.reviewApprovedRates
  const storedBaselineRates = fieldTakeoff?.reviewBaselineRates
  const storedReviewNotes = fieldTakeoff?.rejectionNotes

  useEffect(() => {
    if (!v2Quote) return
    const approved = approvedRates as Record<string, unknown> | undefined
    const baseline = resolveOrderBaselineRates(v2Quote, {
      measurements: [],
      photos: [],
      accessories: [],
      checklist: [],
      reviewBaselineRates: storedBaselineRates as Record<string, unknown> | undefined,
      reviewApprovedRates: approved,
    })
    const source =
      approved?.hangerRate != null
        ? {
            hangerRate: String(approved.hangerRate),
            finisherRate: String(approved.finisherRate ?? baseline.finisherRate),
            prepCleanRate: String(approved.prepCleanRate ?? baseline.prepCleanRate),
          }
        : {
            hangerRate: String(v2Quote.hangerRate ?? baseline.hangerRate),
            finisherRate: String(v2Quote.finisherRate ?? baseline.finisherRate),
            prepCleanRate: String(v2Quote.prepCleanRate ?? baseline.prepCleanRate),
          }
    setLaborRates({
      ...source,
      reviewNotes: String(storedReviewNotes ?? (v2Quote as Record<string, unknown>).reviewNotes ?? ''),
    })
  }, [v2Quote, approvedRates, storedBaselineRates, storedReviewNotes])

  // What the card holds is what we pay the crew, plus the job's margin headroom —
  // owner and office_drywall business, the same bar as approving a takeoff or editing
  // the catalogs. `readOnly` was never enough: it stopped the edit but still rendered
  // the rates to every office_gc who can reach Field Measurement (canWriteDrywallField
  // admits them) and to anyone on Production. Gated here rather than at the two mount
  // sites so a third mount cannot forget it.
  if (!canWriteDrywallProject(effectiveRole)) return null

  if (!quote || !fieldTakeoff) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Load quote and field measurement data to review labor rates and financial impact.
        </CardContent>
      </Card>
    )
  }

  if (!v2Quote) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Loading catalogs for labor rate review…
        </CardContent>
      </Card>
    )
  }

  const fieldSqft = fieldTakeoff.totalMeasuredSqft || 0
  if (fieldSqft <= 0) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="py-6 text-sm text-amber-800 dark:text-amber-200">
          Add field measurements before adjusting labor rates. Quote totals are available on the
          Quote stage.
        </CardContent>
      </Card>
    )
  }

  const fin = buildOrderFinancialComparison(v2Quote, fieldTakeoff, changeOrders, laborRates, {
    v3Quote,
    catalogs,
  })
  const reviewStatus = fieldTakeoff.reviewStatus
  const isPending = reviewStatus === 'pending_review'
  const logEntries = parseRateAdjustmentLog(fieldTakeoff.rateAdjustmentLog)

  const persistRates = async (patch: Partial<FieldTakeoff>) => {
    setSaving(true)
    try {
      await onSaveFieldTakeoff({
        ...fieldTakeoff,
        ...patch,
        updatedAt: new Date().toISOString(),
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save review')
      throw e
    } finally {
      setSaving(false)
    }
  }

  const currentRatesFromForm = (): OrderLaborRateSet => ({
    hangerRate: parseFloat(laborRates.hangerRate) || baselineRates?.hangerRate || 0,
    finisherRate: parseFloat(laborRates.finisherRate) || baselineRates?.finisherRate || 0,
    prepCleanRate: parseFloat(laborRates.prepCleanRate) || baselineRates?.prepCleanRate || 0,
  })

  const previousStoredRates = (): { hanger: number; finisher: number; prepClean: number } => {
    const approved = fieldTakeoff.reviewApprovedRates as Record<string, unknown> | undefined
    if (approved?.hangerRate != null) {
      return rateTriple(
        Number(approved.hangerRate),
        Number(approved.finisherRate ?? baselineRates?.finisherRate ?? 0),
        Number(approved.prepCleanRate ?? baselineRates?.prepCleanRate ?? 0),
      )
    }
    return rateTriple(
      baselineRates?.hangerRate ?? 0,
      baselineRates?.finisherRate ?? 0,
      baselineRates?.prepCleanRate ?? 0,
    )
  }

  const buildLogEntry = (
    from: { hanger: number; finisher: number; prepClean: number },
    to: { hanger: number; finisher: number; prepClean: number },
    reason: string,
  ): LaborRateAdjustmentLogEntry => ({
    at: new Date().toISOString(),
    byUserId: profile?.id ?? '',
    byName: profile?.full_name?.trim() || profile?.email?.trim() || 'Unknown',
    from,
    to,
    reason,
    marginAtChange: fin.adjustedMargin,
    sqftVarianceAtChange: fin.varianceSqft,
  })

  const handleSaveRates = async () => {
    const next = currentRatesFromForm()
    const from = previousStoredRates()
    const to = rateTriple(next.hangerRate, next.finisherRate, next.prepCleanRate)
    const changed = ratesChanged(from, to)
    const reason = laborRates.reviewNotes?.trim() ?? ''
    if (changed && !reason) {
      toast.error('Add a reason before changing labor rates.')
      return
    }

    const baseline =
      fieldTakeoff.reviewBaselineRates ??
      (baselineRates
        ? {
            hangerRate: baselineRates.hangerRate,
            finisherRate: baselineRates.finisherRate,
            prepCleanRate: baselineRates.prepCleanRate,
          }
        : undefined)

    const nextLog = changed
      ? [buildLogEntry(from, to, reason), ...logEntries]
      : logEntries

    await persistRates({
      reviewBaselineRates: baseline ? asStoredRateRecord(baseline) : undefined,
      reviewApprovedRates: asStoredRateRecord(next),
      rejectionNotes: laborRates.reviewNotes || undefined,
      rateAdjustmentLog: nextLog,
    })
    toast.success('Labor rates saved')
  }

  const handleApprove = async () => {
    const storedBaseline = fieldTakeoff.reviewBaselineRates as Record<string, unknown> | undefined
    const baselineSet: OrderLaborRateSet =
      storedBaseline?.hangerRate != null
        ? {
            hangerRate: Number(storedBaseline.hangerRate),
            finisherRate: Number(storedBaseline.finisherRate ?? baselineRates?.finisherRate ?? 0),
            prepCleanRate: Number(storedBaseline.prepCleanRate ?? baselineRates?.prepCleanRate ?? 0),
          }
        : baselineRates ?? resolveOrderBaselineRates(v2Quote, fieldTakeoff)

    const next = {
      hangerRate: parseFloat(laborRates.hangerRate) || baselineSet.hangerRate,
      finisherRate: parseFloat(laborRates.finisherRate) || baselineSet.finisherRate,
      prepCleanRate: parseFloat(laborRates.prepCleanRate) || baselineSet.prepCleanRate,
    }
    const from = previousStoredRates()
    const to = rateTriple(next.hangerRate, next.finisherRate, next.prepCleanRate)
    const changed = ratesChanged(from, to)
    const reason = laborRates.reviewNotes?.trim() ?? ''
    if (changed && !reason) {
      toast.error('Add a reason before changing labor rates.')
      return
    }
    const nextLog = changed ? [buildLogEntry(from, to, reason), ...logEntries] : logEntries

    await persistRates({
      reviewStatus: 'approved',
      approvedAt: new Date().toISOString(),
      reviewBaselineRates: asStoredRateRecord(baselineSet),
      reviewApprovedRates: asStoredRateRecord(next),
      rejectionNotes: laborRates.reviewNotes || undefined,
      rateAdjustmentLog: nextLog,
    })
    toast.success('Field measurement approved — labor rates saved')
  }

  const handleReject = async () => {
    await persistRates({
      reviewStatus: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectionNotes: laborRates.reviewNotes || undefined,
    })
    toast.error('Field measurement rejected')
  }

  const comparisonRows = [
    {
      label: 'Sqft',
      original: fin.originalSqft.toLocaleString(undefined, { maximumFractionDigits: 1 }),
      revised: fin.revisedSqft.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      change: `${fin.varianceSqft >= 0 ? '+' : ''}${fin.varianceSqft.toLocaleString(undefined, { maximumFractionDigits: 1 })}`,
    },
    {
      label: 'Hanger rate',
      original: rateMoney(fin.originalHangerRate),
      revised: rateMoney(fin.revisedHangerRate),
      change: `${fin.revisedHangerRate - fin.originalHangerRate >= 0 ? '+' : ''}${rateMoney(fin.revisedHangerRate - fin.originalHangerRate)}`,
    },
    {
      label: 'Finisher rate',
      original: rateMoney(fin.originalFinisherRate),
      revised: rateMoney(fin.revisedFinisherRate),
      change: `${fin.revisedFinisherRate - fin.originalFinisherRate >= 0 ? '+' : ''}${rateMoney(fin.revisedFinisherRate - fin.originalFinisherRate)}`,
    },
    {
      label: 'Prep/clean rate',
      original: rateMoney(fin.originalPrepRate),
      revised: rateMoney(fin.revisedPrepRate),
      change: `${fin.revisedPrepRate - fin.originalPrepRate >= 0 ? '+' : ''}${rateMoney(fin.revisedPrepRate - fin.originalPrepRate)}`,
    },
    {
      label: 'Labor cost (w/ burden)',
      original: money(fin.baselineLaborWithTax),
      revised: money(fin.adjustedLaborWithTax),
      change: `${fin.deltaLaborWithTax >= 0 ? '+' : ''}${money(fin.deltaLaborWithTax)}`,
    },
    {
      label: 'Hanger pay total',
      original: money(fin.originalHangerPay),
      revised: money(fin.revisedHangerPay),
      change: `${fin.revisedHangerPay - fin.originalHangerPay >= 0 ? '+' : ''}${money(fin.revisedHangerPay - fin.originalHangerPay)}`,
    },
    {
      label: 'Finisher pay total',
      original: money(fin.originalFinisherPay),
      revised: money(fin.revisedFinisherPay),
      change: `${fin.revisedFinisherPay - fin.originalFinisherPay >= 0 ? '+' : ''}${money(fin.revisedFinisherPay - fin.originalFinisherPay)}`,
    },
    {
      label: 'Prep/clean pay total',
      original: money(fin.originalPrepPay),
      revised: money(fin.revisedPrepPay),
      change: `${fin.revisedPrepPay - fin.originalPrepPay >= 0 ? '+' : ''}${money(fin.revisedPrepPay - fin.originalPrepPay)}`,
    },
    {
      label: 'Material cost',
      original: money(fin.originalMaterialCost),
      revised: money(fin.revisedMaterialCost),
      change: `${fin.revisedMaterialCost - fin.originalMaterialCost >= 0 ? '+' : ''}${money(fin.revisedMaterialCost - fin.originalMaterialCost)}`,
    },
    {
      label: 'Contract value',
      original: money(fin.baselineTotal),
      revised: money(fin.adjustedTotal),
      change: `${fin.deltaTotal >= 0 ? '+' : ''}${money(fin.deltaTotal)}`,
    },
    {
      label: 'Profit $',
      original: money(fin.baselineProfit),
      revised: money(fin.adjustedProfit),
      change: `${fin.deltaProfit >= 0 ? '+' : ''}${money(fin.deltaProfit)}`,
    },
    {
      label: 'Profit margin %',
      original: `${fin.baselineMargin.toFixed(2)}%`,
      revised: `${fin.adjustedMargin.toFixed(2)}%`,
      change: `${fin.deltaMargin >= 0 ? '+' : ''}${fin.deltaMargin.toFixed(2)} pts`,
    },
  ]

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-primary" />
                Labor rate adjustments
              </CardTitle>
              <CardDescription>
                Quoted rates stay unchanged. These are the rates the work pays. Burden follows
                quote toggles per trade.
              </CardDescription>
            </div>
            {isPending && (
              <span
                className={cn(
                  'inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                  'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
                )}
              >
                <Clock className="mr-1 h-3 w-3" />
                Pending review
              </span>
            )}
            {reviewStatus === 'approved' && (
              <span
                className={cn(
                  'inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                  'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                )}
              >
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Approved
              </span>
            )}
            {reviewStatus === 'rejected' && (
              <span
                className={cn(
                  'inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                  'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
                )}
              >
                <XCircle className="mr-1 h-3 w-3" />
                Rejected
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Hanger ($/sqft)</Label>
              <Input
                type="number"
                step="0.01"
                disabled={readOnly}
                value={laborRates.hangerRate}
                onChange={(e) => setLaborRates((p) => ({ ...p, hangerRate: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Quote baseline: {rateMoney(fin.originalHangerRate)}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Finisher ($/sqft)</Label>
              <Input
                type="number"
                step="0.01"
                disabled={readOnly}
                value={laborRates.finisherRate}
                onChange={(e) => setLaborRates((p) => ({ ...p, finisherRate: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Quote baseline: {rateMoney(fin.originalFinisherRate)}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Prep / clean ($/sqft)</Label>
              <Input
                type="number"
                step="0.01"
                disabled={readOnly}
                value={laborRates.prepCleanRate}
                onChange={(e) => setLaborRates((p) => ({ ...p, prepCleanRate: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Quote baseline: {rateMoney(fin.originalPrepRate)}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Reason for this change</Label>
            <Textarea
              rows={3}
              disabled={readOnly}
              value={laborRates.reviewNotes ?? ''}
              placeholder="Required when rates change — e.g. sqft came in under, finisher called about extra coats."
              onChange={(e) => setLaborRates((p) => ({ ...p, reviewNotes: e.target.value }))}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {!readOnly && (
              <Button type="button" variant="secondary" disabled={saving} onClick={() => void handleSaveRates()}>
                {saving ? 'Saving…' : 'Save labor rates'}
              </Button>
            )}
            {!readOnly && isPending && (
              <>
                <Button type="button" disabled={saving} onClick={() => void handleApprove()}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Approve field measurement
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => void handleReject()}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Budget headroom (live)</CardTitle>
          <CardDescription>
            Original = quoted labour and material. Revised = adjusted rates × field sqft
            (material scaled with sqft). Accepted change orders update the contract value.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-4 gap-2 bg-muted/50 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
              <span>Metric</span>
              <span className="text-right">Original</span>
              <span className="text-right">Field / revised</span>
              <span className="text-right">Change</span>
            </div>
            <div className="divide-y">
              {comparisonRows.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-4 gap-2 px-3 py-2 text-sm items-center"
                >
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="text-right">{row.original}</span>
                  <span className="text-right font-medium text-primary">{row.revised}</span>
                  <span className={`text-right font-semibold ${changeClass(row.change)}`}>
                    {row.change}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Contract value equals the original accepted quote plus accepted change orders. Labor
            burden honors per-trade settings from the quote stage.
          </p>
        </CardContent>
      </Card>

      {logEntries.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Rate adjustment log</CardTitle>
            <CardDescription>Most recent first. Reasons stay with the change.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {logEntries.slice(0, 8).map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="rounded-lg border px-3 py-2 text-sm">
                  <p className="font-medium">
                    {formatLogWhen(entry.at)}
                    {entry.byName ? ` · ${entry.byName}` : ''}
                  </p>
                  <p className="text-muted-foreground mt-1">
                    Hanger {rateMoney(entry.from.hanger)} → {rateMoney(entry.to.hanger)}
                    {' · '}Finisher {rateMoney(entry.from.finisher)} → {rateMoney(entry.to.finisher)}
                    {' · '}Prep {rateMoney(entry.from.prepClean)} → {rateMoney(entry.to.prepClean)}
                  </p>
                  <p className="mt-1">{entry.reason}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Margin at change {entry.marginAtChange.toFixed(1)}% · sqft variance{' '}
                    {entry.sqftVarianceAtChange >= 0 ? '+' : ''}
                    {entry.sqftVarianceAtChange.toLocaleString(undefined, {
                      maximumFractionDigits: 1,
                    })}
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

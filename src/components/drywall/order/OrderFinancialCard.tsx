import { useEffect, useMemo, useState } from 'react'
import { Calculator, CheckCircle2, Clock, FileDown, TrendingUp, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  buildOrderFinancialComparison,
  resolveOrderBaselineRates,
  type OrderLaborRateSet,
  type OrderReviewLaborRatesInput,
} from '@/lib/drywall/orderFinancialComparison'
import { downloadDrywallLaborRateCardPdf } from '@/lib/drywallOrderPdf'
import type { DrywallChangeOrder, DrywallQuote, FieldTakeoff } from '@/types/drywall'

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

interface Props {
  quote: DrywallQuote | null
  fieldTakeoff: FieldTakeoff | null
  changeOrders: DrywallChangeOrder[]
  readOnly: boolean
  projectName: string
  onSaveFieldTakeoff: (takeoff: FieldTakeoff) => Promise<void>
}

export function OrderFinancialCard({
  quote,
  fieldTakeoff,
  changeOrders,
  readOnly,
  projectName,
  onSaveFieldTakeoff,
}: Props) {
  const [saving, setSaving] = useState(false)
  const [laborRates, setLaborRates] = useState<OrderReviewLaborRatesInput>({
    hangerRate: '',
    finisherRate: '',
    prepCleanRate: '',
    reviewNotes: '',
  })

  const baselineRates = useMemo(
    () => (quote && fieldTakeoff ? resolveOrderBaselineRates(quote, fieldTakeoff) : null),
    [quote, fieldTakeoff],
  )

  useEffect(() => {
    if (!quote || !fieldTakeoff) return
    const approved = fieldTakeoff.reviewApprovedRates as Record<string, unknown> | undefined
    const baseline = resolveOrderBaselineRates(quote, fieldTakeoff)
    const source =
      approved?.hangerRate != null
        ? {
            hangerRate: String(approved.hangerRate),
            finisherRate: String(approved.finisherRate ?? baseline.finisherRate),
            prepCleanRate: String(approved.prepCleanRate ?? baseline.prepCleanRate),
          }
        : {
            hangerRate: String(quote.hangerRate ?? baseline.hangerRate),
            finisherRate: String(quote.finisherRate ?? baseline.finisherRate),
            prepCleanRate: String(quote.prepCleanRate ?? baseline.prepCleanRate),
          }
    setLaborRates((prev) => ({
      ...source,
      reviewNotes:
        prev.reviewNotes ||
        String(fieldTakeoff.rejectionNotes ?? (quote as Record<string, unknown>).reviewNotes ?? ''),
    }))
  }, [quote, fieldTakeoff])

  if (!quote || !fieldTakeoff) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Load quote and field measurement data to review labor rates and financial impact.
        </CardContent>
      </Card>
    )
  }

  const fieldSqft = fieldTakeoff.totalMeasuredSqft || 0
  if (fieldSqft <= 0) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="py-6 text-sm text-amber-800 dark:text-amber-200">
          Add field measurements before adjusting order-stage labor rates. Quote totals are
          available on the Quote stage.
        </CardContent>
      </Card>
    )
  }

  const fin = buildOrderFinancialComparison(quote, fieldTakeoff, changeOrders, laborRates)
  const reviewStatus = fieldTakeoff.reviewStatus
  const isPending = reviewStatus === 'pending_review'

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

  const handleSaveRates = async () => {
    const baseline =
      fieldTakeoff.reviewBaselineRates ??
      (baselineRates
        ? {
            hangerRate: baselineRates.hangerRate,
            finisherRate: baselineRates.finisherRate,
            prepCleanRate: baselineRates.prepCleanRate,
          }
        : undefined)

    await persistRates({
      reviewBaselineRates: baseline ? asStoredRateRecord(baseline) : undefined,
      reviewApprovedRates: asStoredRateRecord({
        hangerRate: parseFloat(laborRates.hangerRate) || baselineRates?.hangerRate || 0,
        finisherRate: parseFloat(laborRates.finisherRate) || baselineRates?.finisherRate || 0,
        prepCleanRate: parseFloat(laborRates.prepCleanRate) || baselineRates?.prepCleanRate || 0,
      }),
      rejectionNotes: laborRates.reviewNotes || undefined,
    })
    toast.success('Labor rates saved')
  }

  const handleApprove = async () => {
    const storedBaseline = fieldTakeoff.reviewBaselineRates as Record<string, unknown> | undefined
    const baselineSet: OrderLaborRateSet =
      storedBaseline?.hangerRate != null
        ? {
            hangerRate: Number(storedBaseline.hangerRate),
            finisherRate: Number(
              storedBaseline.finisherRate ?? baselineRates?.finisherRate ?? 0,
            ),
            prepCleanRate: Number(
              storedBaseline.prepCleanRate ?? baselineRates?.prepCleanRate ?? 0,
            ),
          }
        : baselineRates ?? resolveOrderBaselineRates(quote, fieldTakeoff)

    await persistRates({
      reviewStatus: 'approved',
      approvedAt: new Date().toISOString(),
      reviewBaselineRates: asStoredRateRecord(baselineSet),
      reviewApprovedRates: asStoredRateRecord({
        hangerRate: parseFloat(laborRates.hangerRate) || baselineSet.hangerRate,
        finisherRate: parseFloat(laborRates.finisherRate) || baselineSet.finisherRate,
        prepCleanRate: parseFloat(laborRates.prepCleanRate) || baselineSet.prepCleanRate,
      }),
      rejectionNotes: laborRates.reviewNotes || undefined,
    })
    toast.success('Field measurement approved — order-stage labor rates saved')
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
      original: fin.originalSqft.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      revised: fin.revisedSqft.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      change: `${fin.varianceSqft >= 0 ? '+' : ''}${fin.varianceSqft.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Field measurement review</h3>
          <p className="text-sm text-muted-foreground">
            Compare quoted vs field sqft, adjust labor rates, and see profit impact.
          </p>
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calculator className="h-5 w-5 text-primary" />
            Quote vs field measurement
          </CardTitle>
          <CardDescription>Quoted sqft includes waste from the quote stage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs uppercase text-muted-foreground mb-1">Quoted sqft</p>
              <p className="text-2xl font-bold">{fin.originalSqft.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs uppercase text-muted-foreground mb-1">Field measured</p>
              <p className="text-2xl font-bold">{fin.revisedSqft.toLocaleString()}</p>
            </div>
            <div
              className={`rounded-lg border p-4 ${
                fin.varianceSqft === 0
                  ? 'bg-muted/30'
                  : fin.varianceSqft > 0
                    ? 'border-emerald-500/30 bg-emerald-500/10'
                    : 'border-red-500/30 bg-red-500/10'
              }`}
            >
              <p className="text-xs uppercase text-muted-foreground mb-1">Variance</p>
              <p className="text-2xl font-bold">
                {fin.varianceSqft > 0 ? '+' : ''}
                {fin.varianceSqft.toLocaleString()} sqft
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {fin.variancePercent > 0 ? '+' : ''}
                {fin.variancePercent.toFixed(1)}%
              </p>
            </div>
          </div>
          {fieldTakeoff.varianceNotes ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <p className="font-medium text-amber-900 dark:text-amber-100">Variance notes</p>
              <p className="text-amber-800 dark:text-amber-200 mt-1">{fieldTakeoff.varianceNotes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-primary" />
            Labor rate adjustments
          </CardTitle>
          <CardDescription>
            Order-stage rates (quote-stage rates stay unchanged). Burden follows quote toggles per
            trade.
          </CardDescription>
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
            <Label>Review notes</Label>
            <Textarea
              rows={3}
              disabled={readOnly}
              value={laborRates.reviewNotes ?? ''}
              placeholder="Notes about rate adjustments, field conditions, etc."
              onChange={(e) => setLaborRates((p) => ({ ...p, reviewNotes: e.target.value }))}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                downloadDrywallLaborRateCardPdf({ name: projectName }, fin, {
                  reviewNotes: laborRates.reviewNotes,
                })
                toast.success('Labor rate card PDF downloaded')
              }}
            >
              <FileDown className="mr-2 h-4 w-4" />
              Download rate card PDF
            </Button>
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
          <CardTitle className="text-lg">Financial impact (live)</CardTitle>
          <CardDescription>
            Original = quote baseline rates × quoted sqft. Revised = adjusted rates × field sqft
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
    </div>
  )
}

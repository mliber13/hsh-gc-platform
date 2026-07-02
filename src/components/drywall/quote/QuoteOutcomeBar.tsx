import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { BelowFloorMarginDialog } from '@/components/drywall/margin/BelowFloorMarginDialog'
import { usePermissions } from '@/hooks/usePermissions'
import { formatQuoteMoney } from '@/lib/drywall/quoteV3Math'
import {
  computeQuoteEstimatedCost,
  evaluateMarginVsFloor,
  type MarginFloorEvaluation,
} from '@/lib/drywall/marginFloor'
import { canWriteDrywallProject } from '@/routes/RequirePermission'
import { fetchOrgDrywallCatalogs } from '@/services/drywallCatalogsService'
import {
  DrywallProjectPermissionError,
  fetchDrywallProjectById,
  getQuoteOutcomeFromLegacy,
  markQuoteApproved,
  markQuoteLost,
  markQuoteSent,
  recordBelowFloorApproval,
  unlockQuoteForRevision,
} from '@/services/drywallProjectsService'
import type { DrywallQuoteOutcome } from '@/types/drywall'
import { cn } from '@/lib/utils'

type OutcomeMeta = ReturnType<typeof getQuoteOutcomeFromLegacy>

type DialogKind = 'sent' | 'sent-below-floor' | 'approved' | 'lost' | 'unlock' | null

interface QuoteOutcomeBarProps {
  projectId: string
  /** Live computed bid total (routine base bid) for confirm dialogs. */
  currentBidTotal: number | null
  /** routineSubtotal + cleanupTotal for margin floor evaluation. */
  quoteEstimatedCost: number | null
  /** Form has unsaved edits — disables outcome actions to prevent data loss. */
  isDirty?: boolean
  onOutcomeChange: () => void | Promise<void>
}

function formatOutcomeDate(iso: string | undefined): string {
  if (!iso) return ''
  try {
    return format(new Date(iso), 'MMM d, yyyy')
  } catch {
    return ''
  }
}

function effectiveDateToIso(d: string): string | undefined {
  if (!d) return undefined
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return undefined
  return new Date(y, m - 1, day, 12, 0, 0).toISOString()
}

function isoToDateInputValue(iso: string | undefined): string | undefined {
  if (!iso) return undefined
  try {
    return format(new Date(iso), 'yyyy-MM-dd')
  } catch {
    return undefined
  }
}

function OutcomeEffectiveDateField({
  label,
  value,
  onChange,
  min,
  max,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  min?: string
  max: string
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`outcome-date-${label}`}>{label}</Label>
      <Input
        id={`outcome-date-${label}`}
        type="date"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        Defaults to today — set the real date for historical accuracy.
      </p>
    </div>
  )
}

function outcomeBadgeClass(outcome: DrywallQuoteOutcome): string {
  switch (outcome) {
    case 'sent':
      return 'border-blue-500/40 bg-blue-500/10 text-blue-800 dark:text-blue-200'
    case 'approved':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
    case 'lost':
      return 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200'
    default:
      return 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300'
  }
}

export function QuoteOutcomeBar({
  projectId,
  currentBidTotal,
  quoteEstimatedCost,
  isDirty = false,
  onOutcomeChange,
}: QuoteOutcomeBarProps) {
  const { effectiveRole } = usePermissions()
  const canWrite = canWriteDrywallProject(effectiveRole)

  const [meta, setMeta] = useState<OutcomeMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [checkingMargin, setCheckingMargin] = useState(false)
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [lostReason, setLostReason] = useState('')
  const [belowFloorReason, setBelowFloorReason] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [marginEval, setMarginEval] = useState<MarginFloorEvaluation | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const project = await fetchDrywallProjectById(projectId)
      if (!project) {
        setMeta(null)
        return
      }
      setMeta(getQuoteOutcomeFromLegacy(project.legacy))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load quote outcome')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (
      dialog === 'sent' ||
      dialog === 'sent-below-floor' ||
      dialog === 'approved' ||
      dialog === 'lost'
    ) {
      setEffectiveDate(format(new Date(), 'yyyy-MM-dd'))
    }
  }, [dialog])

  if (!canWrite) return null
  if (loading || !meta) return null

  const { outcome, outcomeTimestamps, bidSnapshot, outcomeReason } = meta
  const todayDateMax = format(new Date(), 'yyyy-MM-dd')
  const sentAtDateMin = isoToDateInputValue(outcomeTimestamps.sentAt)
  const money = (n: number | null | undefined) =>
    n != null && Number.isFinite(n) ? formatQuoteMoney(n) : '—'

  const runAction = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      await reload()
      await onOutcomeChange()
      setDialog(null)
      setLostReason('')
      setBelowFloorReason('')
      setEffectiveDate('')
      setMarginEval(null)
      toast.success('Quote outcome updated')
    } catch (e: unknown) {
      if (e instanceof DrywallProjectPermissionError) toast.error(e.message)
      else toast.error(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const handleMarkSentClick = async () => {
    setCheckingMargin(true)
    try {
      const catalogs = await fetchOrgDrywallCatalogs()
      const bidTotal = currentBidTotal ?? 0
      const estimatedCost = quoteEstimatedCost ?? computeQuoteEstimatedCost(0, 0)
      const evaluation = evaluateMarginVsFloor(
        bidTotal,
        estimatedCost,
        catalogs.marginFloorTarget,
      )
      setMarginEval(evaluation)
      setBelowFloorReason('')
      setDialog(evaluation.belowFloor ? 'sent-below-floor' : 'sent')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to evaluate margin')
    } finally {
      setCheckingMargin(false)
    }
  }

  const handleBelowFloorSend = async () => {
    if (!marginEval || !belowFloorReason.trim()) return
    setBusy(true)
    try {
      await recordBelowFloorApproval(projectId, {
        trigger: 'quote_send',
        marginAtApproval: marginEval.marginPct ?? 0,
        bidTotal: marginEval.bidTotal,
        estimatedCost: marginEval.estimatedCost,
        floorTarget: marginEval.floorTarget,
        reason: belowFloorReason.trim(),
      })
      await markQuoteSent(projectId, effectiveDateToIso(effectiveDate))
      await reload()
      await onOutcomeChange()
      setDialog(null)
      setBelowFloorReason('')
      setEffectiveDate('')
      setMarginEval(null)
      toast.success('Quote marked sent (below floor approval recorded)')
    } catch (e: unknown) {
      if (e instanceof DrywallProjectPermissionError) toast.error(e.message)
      else toast.error(e instanceof Error ? e.message : 'Failed to mark sent')
    } finally {
      setBusy(false)
    }
  }

  const badgeLabel = (() => {
    switch (outcome) {
      case 'sent':
        return `Sent on ${formatOutcomeDate(outcomeTimestamps.sentAt)}`
      case 'approved':
        return `Approved on ${formatOutcomeDate(outcomeTimestamps.approvedAt)}`
      case 'lost':
        return `Lost on ${formatOutcomeDate(outcomeTimestamps.lostAt)}`
      default:
        return 'Drafted'
    }
  })()

  return (
    <>
      <div className="flex flex-col gap-3 rounded-lg border bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {outcome === 'lost' && outcomeReason ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        'inline-flex rounded-full border px-3 py-0.5 text-xs font-medium cursor-default',
                        outcomeBadgeClass(outcome),
                      )}
                    >
                      {badgeLabel}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-sm">{outcomeReason}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span
                className={cn(
                  'inline-flex rounded-full border px-3 py-0.5 text-xs font-medium',
                  outcomeBadgeClass(outcome),
                )}
              >
                {badgeLabel}
              </span>
            )}
            {outcome === 'sent' && bidSnapshot && (
              <span className="text-xs text-muted-foreground">
                Bid baseline: {money(bidSnapshot.total)}
              </span>
            )}
          </div>
          {outcome !== 'drafted' && (
            <p className="text-xs text-muted-foreground">
              Quote is locked. Click &quot;Unlock for Revision&quot; to edit.
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5">
          {isDirty && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Save changes before changing outcome.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {outcome === 'drafted' && (
              <Button
                type="button"
                size="sm"
                onClick={() => void handleMarkSentClick()}
                disabled={busy || checkingMargin || isDirty}
                title={isDirty ? 'Save changes before marking sent' : undefined}
              >
                {checkingMargin ? 'Checking…' : 'Mark Sent'}
              </Button>
            )}
            {outcome === 'sent' && (
              <>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setDialog('approved')}
                  disabled={busy || isDirty}
                  title={isDirty ? 'Save changes before marking approved' : undefined}
                >
                  Mark Approved
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDialog('lost')}
                  disabled={busy || isDirty}
                  title={isDirty ? 'Save changes before marking lost' : undefined}
                >
                  Mark Lost
                </Button>
              </>
            )}
            {(outcome === 'approved' || outcome === 'lost') && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setDialog('unlock')}
                disabled={busy || isDirty}
                title={isDirty ? 'Save changes before unlocking' : undefined}
              >
                Unlock for Revision
              </Button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={dialog === 'sent'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark quote sent?</DialogTitle>
            <DialogDescription>
              Lock in this bid as sent? The current computed total ({money(currentBidTotal)}) becomes
              the variance baseline. You can unlock for revision later if needed.
            </DialogDescription>
          </DialogHeader>
          <OutcomeEffectiveDateField
            label="Date sent"
            value={effectiveDate}
            onChange={setEffectiveDate}
            max={todayDateMax}
            disabled={busy}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() =>
                void runAction(() => markQuoteSent(projectId, effectiveDateToIso(effectiveDate)))
              }
              disabled={busy}
            >
              {busy ? 'Saving…' : 'Mark Sent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BelowFloorMarginDialog
        open={dialog === 'sent-below-floor'}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null)
            setBelowFloorReason('')
            setMarginEval(null)
          }
        }}
        evaluation={marginEval}
        variant="quote_send"
        reason={belowFloorReason}
        onReasonChange={setBelowFloorReason}
        busy={busy}
        onConfirm={() => void handleBelowFloorSend()}
      >
        <OutcomeEffectiveDateField
          label="Date sent"
          value={effectiveDate}
          onChange={setEffectiveDate}
          max={todayDateMax}
          disabled={busy}
        />
      </BelowFloorMarginDialog>

      <Dialog open={dialog === 'approved'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark quote approved?</DialogTitle>
            <DialogDescription>
              Mark this quote approved? Project will advance to Field Measurement if it hasn&apos;t
              already.
            </DialogDescription>
          </DialogHeader>
          <OutcomeEffectiveDateField
            label="Date approved"
            value={effectiveDate}
            onChange={setEffectiveDate}
            min={sentAtDateMin}
            max={todayDateMax}
            disabled={busy}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() =>
                void runAction(() =>
                  markQuoteApproved(projectId, effectiveDateToIso(effectiveDate)),
                )
              }
              disabled={busy}
            >
              {busy ? 'Saving…' : 'Mark Approved'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'lost'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark quote lost?</DialogTitle>
            <DialogDescription>
              Record this bid as lost. Project status stays on Quote.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            placeholder="Reason for loss (optional — e.g. price, scope, timing)"
            rows={3}
            disabled={busy}
          />
          <OutcomeEffectiveDateField
            label="Date lost"
            value={effectiveDate}
            onChange={setEffectiveDate}
            min={sentAtDateMin}
            max={todayDateMax}
            disabled={busy}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                void runAction(() =>
                  markQuoteLost(
                    projectId,
                    lostReason.trim() || undefined,
                    effectiveDateToIso(effectiveDate),
                  ),
                )
              }
              disabled={busy}
            >
              {busy ? 'Saving…' : 'Mark Lost'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'unlock'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Unlock for revision?</DialogTitle>
            <DialogDescription>
              Unlocking clears the bid snapshot and outcome timestamps. The project status badge is
              NOT reverted — if approval already advanced this project to Field Measurement, it
              stays there. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void runAction(() => unlockQuoteForRevision(projectId))}
              disabled={busy}
            >
              {busy ? 'Saving…' : 'Unlock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function isQuoteOutcomeLocked(outcome: DrywallQuoteOutcome | undefined): boolean {
  return outcome != null && outcome !== 'drafted'
}

import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { hasMeasurement, isMeasurementApproved } from '@/lib/drywall/fieldReview'
import type { FieldTakeoff } from '@/types/drywall'

function formatReviewTimestamp(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null
  try {
    return format(parseISO(iso), 'MMM d, yyyy h:mm a')
  } catch {
    return iso
  }
}

/**
 * Changes to the measurement after it was approved (fieldReview.recordChangeAfterApproval) —
 * the approval stands, and this says what moved since.
 */
function ChangesAfterApproval({ takeoff }: { takeoff: FieldTakeoff }) {
  const changes = takeoff.changesAfterApproval ?? []
  if (changes.length === 0) return null
  return (
    <div className="space-y-1 border-t border-current/15 pt-2 text-sm">
      <p className="font-medium">Changed after approval</p>
      <ul className="space-y-0.5">
        {changes.map((c, i) => {
          const delta = c.toSqft - c.fromSqft
          return (
            <li key={`${c.at}-${i}`} className="tabular-nums">
              {c.fromSqft.toLocaleString()} → {c.toSqft.toLocaleString()} sqft ({delta > 0 ? '+' : ''}
              {delta.toLocaleString()}) · {formatReviewTimestamp(c.at) ?? c.at} · {c.by}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export interface FieldTakeoffReviewBannerProps {
  takeoff: FieldTakeoff
  /** Nothing to approve until something is measured. */
  measuredSqft: number
  /** Owner + office_drywall — approve/reject actions. */
  canReview: boolean
  busy?: boolean
  /**
   * The page holds changes not yet saved. Approving writes the whole takeoff on screen with the
   * approval, so the button says so rather than hiding — a crew-submitted takeoff always opens
   * with unsaved changes, because the page fills in its accessories on first open.
   */
  unsaved?: boolean
  onApprove: () => void | Promise<void>
  onReject: (notes: string) => void | Promise<void>
}

export function FieldTakeoffReviewBanner({
  takeoff,
  measuredSqft,
  canReview,
  busy = false,
  unsaved = false,
  onApprove,
  onReject,
}: FieldTakeoffReviewBannerProps) {
  const approveLabel = (base: string) => (unsaved ? `Save & ${base.toLowerCase()}` : base)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectNotes, setRejectNotes] = useState('')

  const status = takeoff.reviewStatus

  useEffect(() => {
    if (rejectOpen) {
      setRejectNotes(takeoff.rejectionNotes?.trim() ?? '')
    }
  }, [rejectOpen, takeoff.rejectionNotes])

  // No review status: an office-measured takeoff. It used to have no approval step at all —
  // saving the labor rates stood in for one — so offer the approval here, and read a takeoff
  // whose rates were already saved under the old flow as approved (fieldReview.ts).
  if (status !== 'pending_review' && status !== 'approved' && status !== 'rejected') {
    // Nothing to approve until something is recorded — an area with no drywall counts.
    if (!hasMeasurement(takeoff, measuredSqft)) return null
    if (isMeasurementApproved(takeoff)) {
      return (
        <div className="space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-950 dark:text-emerald-100">
          <p className="font-medium">Approved with the labor rates, before measurement review was its own step</p>
          <ChangesAfterApproval takeoff={takeoff} />
        </div>
      )
    }
    return (
      <div className="rounded-lg border px-4 py-4 space-y-3">
        <p className="text-sm font-medium">Not reviewed yet</p>
        <p className="text-sm text-muted-foreground">
          Check the measurements against the quote, then approve them. Approving locks the takeoff
          for the measurer and opens the labor rates.
        </p>
        {canReview ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => void onApprove()}>
            {approveLabel('Approve measurement')}
          </Button>
        ) : null}
      </div>
    )
  }

  const submittedLabel = formatReviewTimestamp(takeoff.submittedForReviewAt)
  const approvedLabel = formatReviewTimestamp(takeoff.approvedAt)
  const rejectedLabel = formatReviewTimestamp(takeoff.rejectedAt)

  const bannerClass =
    status === 'pending_review'
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100'
      : status === 'approved'
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100'
        : 'border-red-500/40 bg-red-500/10 text-red-950 dark:text-red-100'

  return (
    <>
      <div className={cn('rounded-lg border px-4 py-4 space-y-3', bannerClass)}>
        {status === 'pending_review' ? (
          <>
            <p className="text-sm font-medium">
              Submitted for review
              {submittedLabel ? ` · ${submittedLabel}` : ''}
            </p>
            {canReview ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={busy} onClick={() => void onApprove()}>
                  {approveLabel('Approve')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setRejectOpen(true)}
                >
                  Reject
                </Button>
              </div>
            ) : null}
          </>
        ) : null}

        {status === 'approved' ? (
          <>
            <p className="text-sm font-medium">
              Approved{approvedLabel ? ` · ${approvedLabel}` : ''}
            </p>
            <ChangesAfterApproval takeoff={takeoff} />
          </>
        ) : null}

        {status === 'rejected' ? (
          <>
            <p className="text-sm font-medium">
              Sent back for changes{rejectedLabel ? ` · ${rejectedLabel}` : ''}
            </p>
            {takeoff.rejectionNotes?.trim() ? (
              <p className="text-sm whitespace-pre-wrap">{takeoff.rejectionNotes.trim()}</p>
            ) : null}
            {canReview ? (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void onApprove()}>
                {approveLabel('Mark approved')}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send back for changes</DialogTitle>
            <DialogDescription>
              Tell the field measurer what needs to be revised. Notes are required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="field-reject-notes">Notes for measurer</Label>
            <Textarea
              id="field-reject-notes"
              rows={4}
              value={rejectNotes}
              disabled={busy}
              placeholder="Describe what needs to change…"
              onChange={(e) => setRejectNotes(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setRejectOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !rejectNotes.trim()}
              onClick={() => {
                void (async () => {
                  await onReject(rejectNotes.trim())
                  setRejectOpen(false)
                })()
              }}
            >
              Send back for changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export { formatReviewTimestamp }
